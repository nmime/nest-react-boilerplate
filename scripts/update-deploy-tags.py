#!/usr/bin/env python3
"""Promote selected immutable image digests in production Helm values.

Usage:
    python3 scripts/update-deploy-tags.py <full_sha> --image <name>=<sha256:digest> [--image ...] [--dry-run]

The release workflow only supplies images built for the candidate SHA. Existing
digests for unaffected workloads remain unchanged, so a small feature release
does not roll the entire application fleet.
"""
import argparse
import difflib
import re
import sys
from pathlib import Path


IMAGE_NAMES = (
    'migrator',
    'admin-app-api',
    'user-app-api',
    'auth-app-api',
    'discord-app-api',
    'telegram-bot-api',
    'admin-app',
    'user-app',
    'landing-app',
    'site-app',
    'mobile-app',
)
PLACEHOLDER = 'sha-REPLACE_WITH_RELEASE_GIT_SHA'


def parse_image_update(value: str) -> tuple[str, str]:
    name, separator, digest = value.partition('=')
    if not separator or name not in IMAGE_NAMES:
        raise argparse.ArgumentTypeError(
            f"image must be one of {', '.join(IMAGE_NAMES)} followed by =sha256:<64 hex characters>"
        )
    if not re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest):
        raise argparse.ArgumentTypeError(f"invalid immutable digest for {name}: {digest}")
    return name, digest.lower()


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
    parser.add_argument('--image', action='append', type=parse_image_update, required=True, help='name=sha256:digest')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--values-file', default='.helm/values-production.yaml')
    args = parser.parse_args()

    if not re.fullmatch(r'[0-9a-fA-F]{40}', args.sha):
        parser.error(f"invalid Git SHA '{args.sha}'; expected exactly 40 hex characters")

    updates = dict(args.image)
    if len(updates) != len(args.image):
        parser.error('each image may be supplied only once')

    values_file = Path(args.values_file)
    if not values_file.exists():
        parser.error(f'{values_file} not found; run from the repository root or pass --values-file')

    tag = f'sha-{args.sha.lower()}'
    original = values_file.read_text()
    updated = original
    for name, digest in updates.items():
        updated = update_image_block(updated, name, tag, digest)

    if PLACEHOLDER in updated and set(updates) != set(IMAGE_NAMES):
        parser.error(
            'production values still contain release placeholders; the first promotion must supply every release image digest'
        )

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
