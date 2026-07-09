#!/usr/bin/env python3
"""Update image tags in deploy/k8s/values.yaml to the given git short SHA.

Usage:
    python3 scripts/update-deploy-tags.py <short_sha>

Example:
    python3 scripts/update-deploy-tags.py a1b2c3d
    # Sets all image tags to "sha-a1b2c3d"
"""
import re
import sys
from pathlib import Path

TAG = f"sha-{sys.argv[1]}" if len(sys.argv) > 1 else "latest"
VALUES_FILE = Path("deploy/k8s/values.yaml")

if not VALUES_FILE.exists():
    print(f"ERROR: {VALUES_FILE} not found. Is this running from the repo root?", file=sys.stderr)
    sys.exit(1)

content = VALUES_FILE.read_text()

# Replace all image tag values that are sha- prefixed
content = re.sub(
    r"(image:\s*\n\s+repository:.*\n\s+tag:\s*)['\"]?(?:sha-[0-9a-f]+|latest)['\"]?",
    rf'\g<1>"{TAG}"',
    content,
    flags=re.DOTALL,
)

# Fallback: catch any remaining tag lines with sha- or latest patterns
content = re.sub(
    r"(^\s+tag:\s*)['\"]?(?:sha-[0-9a-f]+|latest)['\"]?",
    rf'\1"{TAG}"',
    content,
    flags=re.MULTILINE,
)

VALUES_FILE.write_text(content)
print(f"Updated all image tags to {TAG} in {VALUES_FILE}")
