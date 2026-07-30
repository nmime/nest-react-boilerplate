#!/usr/bin/env python3
"""Promote selected immutable image digests in production Helm values.

Usage:
    python3 scripts/update-deploy-tags.py <full_sha> --selected-image <name> \
        --image <name>=<sha256:digest> [--image ...] [--dry-run]

The release workflow supplies the fresh setup-selected image inventory. This
script intersects it with enabled Helm deployment ownership and requires an
exact digest set for that intersection on initial and later promotions.
"""
import argparse
import difflib
import re
from pathlib import Path


IMAGE_NAME_PATTERN = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')


def parse_image_update(value: str) -> tuple[str, str]:
    name, separator, digest = value.partition('=')
    if not separator or not IMAGE_NAME_PATTERN.fullmatch(name):
        raise argparse.ArgumentTypeError('image must be <kebab-case-name>=sha256:<64 hex characters>')
    if not re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest):
        raise argparse.ArgumentTypeError(f"invalid immutable digest for {name}: {digest}")
    return name, digest.lower()


def parse_image_name(value: str) -> str:
    if not IMAGE_NAME_PATTERN.fullmatch(value):
        raise argparse.ArgumentTypeError(f"invalid selected image name: {value}")
    return value


def chart_image_ownership(content: str) -> dict[str, dict[str, str | bool]]:
    ownership: dict[str, dict[str, str | bool]] = {}
    section = ''
    owner = ''
    for line in content.splitlines():
        top_level = re.fullmatch(r'([A-Za-z][A-Za-z0-9]*):\s*', line)
        if top_level:
            section = top_level.group(1)
            owner = 'migrations' if section == 'migrations' else ''
            continue
        if section == 'apps':
            app = re.fullmatch(r'  ([A-Za-z][A-Za-z0-9]*):\s*', line)
            if app:
                owner = f"apps.{app.group(1)}"
                continue
        if not owner:
            continue
        enabled_indent = r'    ' if owner.startswith('apps.') else r'  '
        enabled = re.fullmatch(rf'{enabled_indent}enabled:\s*(true|false)\s*', line, re.IGNORECASE)
        if enabled:
            ownership.setdefault(owner, {})['enabled'] = enabled.group(1).lower() == 'true'
            continue
        repository_indent = r'      ' if owner.startswith('apps.') else r'    '
        repository = re.fullmatch(
            rf'{repository_indent}repository:\s*["\']?([^"\'\s]+)["\']?\s*', line
        )
        if repository:
            ownership.setdefault(owner, {})['image'] = repository.group(1).rsplit('/', 1)[-1]
    return ownership


def enabled_deployment_images(
    base_values: Path, production_values: Path, selection_values: Path
) -> set[str]:
    effective = chart_image_ownership(base_values.read_text())
    for values_file in (production_values, selection_values):
        for owner, override in chart_image_ownership(values_file.read_text()).items():
            effective.setdefault(owner, {}).update(override)
    return {
        str(entry['image'])
        for entry in effective.values()
        if entry.get('enabled') is True and isinstance(entry.get('image'), str)
    }


def update_image_block(content: str, name: str, tag: str, digest: str) -> str:
    repository_pattern = re.compile(
        rf'^(?P<indent>\s*)repository:\s*["\']?\S+/{re.escape(name)}["\']?\s*$', re.MULTILINE
    )
    match = repository_pattern.search(content)
    if not match:
        raise ValueError(f"production values do not contain an image repository ending in /{name}")

    indentation = match.group('indent')
    start = match.end()
    next_repository = re.compile(rf'^{re.escape(indentation)}repository:\s', re.MULTILINE).search(content, start)
    end = next_repository.start() if next_repository else len(content)
    block = content[start:end]
    tag_pattern = re.compile(rf'^{re.escape(indentation)}tag:\s*.*$', re.MULTILINE)
    digest_pattern = re.compile(rf'^{re.escape(indentation)}digest:\s*.*$', re.MULTILINE)
    if not tag_pattern.search(block) or not digest_pattern.search(block):
        raise ValueError(f"production values image block for {name} must contain tag and digest fields")
    block = tag_pattern.sub(f'{indentation}tag: "{tag}"', block, count=1)
    block = digest_pattern.sub(f'{indentation}digest: "{digest}"', block, count=1)
    return content[:start] + block + content[end:]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sha', help='full 40-character Git SHA used for the immutable sha- tag')
    parser.add_argument('--selected-image', action='append', type=parse_image_name, required=True)
    parser.add_argument('--image', action='append', type=parse_image_update, default=[], help='name=sha256:digest')
    parser.add_argument('--print-required', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--base-values-file', default='.helm/values.yaml')
    parser.add_argument('--values-file', default='.helm/values-production.yaml')
    parser.add_argument('--selection-values-file', default='.helm/values-selection.yaml')
    args = parser.parse_args()

    if not re.fullmatch(r'[0-9a-fA-F]{40}', args.sha):
        parser.error(f"invalid Git SHA '{args.sha}'; expected exactly 40 hex characters")

    updates = dict(args.image)
    if len(updates) != len(args.image):
        parser.error('each image may be supplied only once')
    selected = set(args.selected_image)
    if len(selected) != len(args.selected_image):
        parser.error('each selected image may be supplied only once')

    values_file = Path(args.values_file)
    base_values_file = Path(args.base_values_file)
    selection_values_file = Path(args.selection_values_file)
    if not values_file.exists():
        parser.error(f'{values_file} not found; run from the repository root or pass --values-file')
    if not base_values_file.exists():
        parser.error(f'{base_values_file} not found; run from the repository root or pass --base-values-file')
    if not selection_values_file.exists():
        parser.error(
            f'{selection_values_file} not found; run setup or pass the fresh setup-generated --selection-values-file'
        )

    required = selected & enabled_deployment_images(base_values_file, values_file, selection_values_file)
    if not required:
        parser.error('the fresh selected closure and enabled deployment ownership have no release images in common')
    if args.print_required:
        if updates:
            parser.error('--print-required cannot be combined with --image')
        print('\n'.join(sorted(required)))
        return

    missing = required - set(updates)
    if missing:
        parser.error(f"missing immutable digests for selected and enabled images: {', '.join(sorted(missing))}")
    extra = set(updates) - required
    if extra:
        parser.error(f"image digests are outside selected and enabled deployment ownership: {', '.join(sorted(extra))}")

    tag = f'sha-{args.sha.lower()}'
    original = values_file.read_text()
    updated = original
    for name, digest in updates.items():
        updated = update_image_block(updated, name, tag, digest)

    if args.dry_run:
        change_state = 'WOULD update' if updated != original else 'NO CHANGES for'
        print(f"Dry run: {change_state} {len(updates)} image(s) to {tag}")
        if updated != original:
            print(''.join(difflib.unified_diff(original.splitlines(keepends=True), updated.splitlines(keepends=True))))
        return

    values_file.write_text(updated)
    print(f"Updated {len(updates)} immutable image reference(s) to {tag} in {values_file}")


if __name__ == '__main__':
    main()
