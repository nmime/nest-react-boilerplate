#!/bin/sh
# This file is an Nginx geo include, never browser-visible runtime configuration.
# Trust only the immediate TLS terminator's exact IP/CIDR, never an incoming header.
set -eu
TARGET="${FRONTEND_PROXY_TRUST_PATH:-/etc/nginx/nrb-trusted-proxies.conf}"
cidrs="${FRONTEND_TRUSTED_PROXY_CIDRS:-}"
# Validate the complete list before replacing the previous configuration. Nginx
# also validates IPv6 address semantics and the generated include before binding.
validated="$(printf '%s' "$cidrs" | tr ',' ' ' | awk '
  function fail() { print "frontend-proxy-trust: invalid proxy CIDR" > "/dev/stderr"; exit 1 }
  {
    for (i=1; i<=NF; i++) {
      if (split($i, parts, "/") != 2 || parts[2] !~ /^[0-9]+$/ || parts[2]+0 < 1) fail();
      if (index(parts[1], ":")) {
        if (parts[1] !~ /^[0-9A-Fa-f:]+$/ || parts[2]+0 > 128) fail();
      } else {
        if (split(parts[1], octets, ".") != 4 || parts[2]+0 > 32) fail();
        for (j=1; j<=4; j++) if (octets[j] !~ /^[0-9]+$/ || octets[j]+0 > 255) fail();
      }
      print $i " 1;";
    }
  }
')"
printf '%s\n' "$validated" > "$TARGET"
