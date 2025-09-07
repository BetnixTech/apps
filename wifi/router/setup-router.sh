#!/bin/bash
set -e

# Load config
source ./router.conf

echo "[+] Updating system..."
sudo apt update && sudo apt install -y hostapd dnsmasq iptables-persistent

echo "[+] Stopping services..."
sudo systemctl stop hostapd
sudo systemctl stop dnsmasq

echo "[+] Writing hostapd config..."
sudo tee /etc/hostapd/hostapd.conf > /dev/null <<EOL
interface=$WIFI_IFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=$CHANNEL
wmm_enabled=1
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$WIFI_PASS
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOL

sudo sed -i "s|#DAEMON_CONF=.*|DAEMON_CONF=\"/etc/hostapd/hostapd.conf\"|" /etc/default/hostapd

echo "[+] Writing dnsmasq config..."
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
sudo tee /etc/dnsmasq.conf > /dev/null <<EOL
interface=$WIFI_IFACE
dhcp-range=$DHCP_START,$DHCP_END,12h
EOL

echo "[+] Enabling IPv4 forwarding..."
sudo sed -i "s/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/" /etc/sysctl.conf
sudo sysctl -w net.ipv4.ip_forward=1

echo "[+] Setting up NAT..."
sudo iptables -t nat -A POSTROUTING -o $WAN_IFACE -j MASQUERADE
sudo netfilter-persistent save

echo "[+] Starting router services..."
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq
sudo systemctl start hostapd
sudo systemctl start dnsmasq

echo "[✔] Router is running!"
echo "SSID: $SSID"
echo "Password: $WIFI_PASS"
