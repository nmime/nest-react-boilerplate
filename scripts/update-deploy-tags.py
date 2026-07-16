#!/usr/bin/env python3
"""Update image tags in .helm/values-production.yaml to a full release Git SHA.

Usage:
    python3 scripts/update-deploy-tags.py <full_sha> [--dry-run]

Example:
    python3 scripts/update-deploy-tags.py 0123456789abcdef0123456789abcdef01234567
"""
import re
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(f"Usage: {sys.argv[0]} <full-git-sha> [--dry-run]")
        print("  Updates all image tags in .helm/values-production.yaml")
        sys.exit(1)

    sha = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    # Release images are published as sha-<full 40-character github.sha>.
    if not re.fullmatch(r'[0-9a-fA-F]{40}', sha):
        print(
            f"ERROR: Invalid git SHA '{sha}'. Expected exactly 40 hex characters.",
            file=sys.stderr,
        )
        sys.exit(1)

    tag = f"sha-{sha.lower()}"
    values_file = Path(".helm/values-production.yaml")

    if not values_file.exists():
        print(
            f"ERROR: {values_file} not found. Is this running from the repo root?",
            file=sys.stderr,
        )
        sys.exit(1)

    content = values_file.read_text()

    # Pattern 1: full image context block
    new_content = re.sub(
        r"(image:\s*\n\s+repository:.*\n\s+tag:\s*)['\"]?(?:sha-[0-9a-fA-F]+|latest|sha-REPLACE_WITH_RELEASE_GIT_SHA)['\"]?",
        rf'\g<1>"{tag}"',
        content,
        flags=re.DOTALL,
    )

    # Pattern 2: fallback for remaining tag lines
    new_content = re.sub(
        r"^(\s+tag:\s*)['\"]?(?:sha-[0-9a-fA-F]+|latest|sha-REPLACE_WITH_RELEASE_GIT_SHA)['\"]?",
        rf'\1"{tag}"',
        new_content,
        flags=re.MULTILINE,
    )

    if dry_run:
        changed = new_content != content
        print(
            f"Dry run: {'WOULD update' if changed else 'NO CHANGES for'} "
            f"all image tags to {tag}"
        )
        if changed:
            import difflib

            print(
                ''.join(
                    difflib.unified_diff(
                        content.splitlines(keepends=True),
                        new_content.splitlines(keepends=True),
                    )
                )
            )
    else:
        values_file.write_text(new_content)
        print(f"Updated all image tags to {tag} in {values_file}")


if __name__ == '__main__':
    main()
