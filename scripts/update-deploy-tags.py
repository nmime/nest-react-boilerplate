#!/usr/bin/env python3
"""Update image tags in deploy/k8s/values.yaml to the given git short SHA.

Usage:
    python3 scripts/update-deploy-tags.py <short_sha> [--dry-run]

Example:
    python3 scripts/update-deploy-tags.py a1b2c3d
    # Sets all image tags to "sha-a1b2c3d"
"""
import re
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help'):
        print(f"Usage: {sys.argv[0]} <git-short-sha> [--dry-run]")
        print("  Updates all image tags in deploy/k8s/values.yaml")
        sys.exit(1)

    sha = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    # Validate SHA format (hex, 7-40 chars)
    if not re.match(r'^[0-9a-fA-F]{7,40}$', sha):
        print(
            f"ERROR: Invalid git SHA '{sha}'. Expected 7-40 hex characters.",
            file=sys.stderr,
        )
        sys.exit(1)

    tag = f"sha-{sha.lower()}"
    values_file = Path("deploy/k8s/values.yaml")

    if not values_file.exists():
        print(
            f"ERROR: {values_file} not found. Is this running from the repo root?",
            file=sys.stderr,
        )
        sys.exit(1)

    content = values_file.read_text()

    # Pattern 1: full image context block
    new_content = re.sub(
        r"(image:\s*\n\s+repository:.*\n\s+tag:\s*)['"]?(?:sha-[0-9a-fA-F]+|latest)['"]?",
        rf'\g<1>"{tag}"',
        content,
        flags=re.DOTALL,
    )

    # Pattern 2: fallback for remaining tag lines
    new_content = re.sub(
        r"^(\s+tag:\s*)['"]?(?:sha-[0-9a-fA-F]+|latest)['"]?",
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
