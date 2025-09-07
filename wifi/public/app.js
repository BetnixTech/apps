async function init() {
  const me = await (await fetch('/api/me')).json();
  if (me.loggedIn) {
    document.getElementById('auth-area').innerHTML = `
      <span>Hi ${me.user.displayName || me.user.betnixId}</span>
      <a href="/auth/logout" style="margin-left:12px">Logout</a>
    `;
    document.getElementById('settings').style.display = 'block';
  }

  const s = await (await fetch('/api/settings')).json();
  document.getElementById('status-body').innerText = `SSID: ${s.ssid} — channel ${s.channel}`;
  document.getElementById('ssid').value = s.ssid;
  document.getElementById('wifiPass').value = s.wifiPass;
  document.getElementById('channel').value = s.channel;
  document.getElementById('dhcpStart').value = s.dhcpStart;
  document.getElementById('dhcpEnd').value = s.dhcpEnd;

  document.getElementById('saveBtn').onclick = async () => {
    document.getElementById('saveResult').innerText = 'Applying...';
    const payload = {
      ssid: document.getElementById('ssid').value,
      wifiPass: document.getElementById('wifiPass').value,
      channel: Number(document.getElementById('channel').value),
      dhcpStart: document.getElementById('dhcpStart').value,
      dhcpEnd: document.getElementById('dhcpEnd').value
    };
    const res = await fetch('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const json = await res.json();
    if (res.ok && json.ok) {
      document.getElementById('saveResult').innerText = 'Saved and applied!';
      document.getElementById('status-body').innerText = `SSID: ${json.settings.ssid} — channel ${json.settings.channel}`;
    } else {
      document.getElementById('saveResult').innerText = 'Error: ' + (json.error || 'unknown');
    }
  };
}
init().catch(e => {
  console.error(e);
  document.getElementById('status-body').innerText = 'Failed to load';
});
