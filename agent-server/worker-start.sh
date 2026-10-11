#!/bin/sh
set -eu
# Rules are installed before dropping all capabilities and starting user code.
for tool in iptables ip6tables; do
    "$tool" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    "$tool" -A OUTPUT -o lo -j ACCEPT
done
# IPv6 neighbor/router discovery and path-MTU errors are required by Fly's 6PN.
for type in 1 2 3 4 133 134 135 136; do
    ip6tables -A OUTPUT -p ipv6-icmp --icmpv6-type "$type" -j ACCEPT
done
ip6tables -A OUTPUT -d fdaa::3 -p udp --dport 53 -j ACCEPT
ip6tables -A OUTPUT -d fdaa::3 -p tcp --dport 53 -j ACCEPT
for range in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16; do
    iptables -A OUTPUT -d "$range" -j REJECT
done
ip6tables -A OUTPUT -d fc00::/7 -j REJECT
ip6tables -A OUTPUT -d fe80::/10 -j REJECT
for tool in iptables ip6tables; do
    "$tool" -A OUTPUT -p tcp --dport 443 -j ACCEPT
    "$tool" -A OUTPUT -j REJECT
done
exec setpriv --reuid=10001 --regid=10001 --init-groups \
    --bounding-set=-all --no-new-privs \
    /usr/bin/timeout --signal=TERM --kill-after=5 600 \
    /opt/hosaka-field-terminal/.venv/bin/python /app/terminal_worker.py
