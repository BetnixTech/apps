// Replace this token with the real JWT after login
let token = localStorage.getItem('token');

// Fetch profile info
async function loadProfile() {
  const res = await fetch('/api/profile', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  if(data.success) {
    document.getElementById('name').value = data.user.name || '';
    document.getElementById('email').value = data.user.email || '';
    document.getElementById('phone').value = data.user.phone || '';
    document.getElementById('birthday').value = data.user.birthday ? data.user.birthday.split('T')[0] : '';
    document.getElementById('address').value = data.user.address || '';
    document.getElementById('notes').value = data.user.notes || '';
  } else {
    alert(data.message);
  }
}

document.getElementById('profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('name').value,
    phone: document.getElementById('phone').value,
    birthday: document.getElementById('birthday').value,
    address: document.getElementById('address').value,
    notes: document.getElementById('notes').value
  };
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json',
      'Authorization':'Bearer '+token
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  alert(data.message);
});

// Update password
document.getElementById('passwordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const payload = {
    currentPassword: document.getElementById('currentPassword').value,
    newPassword: document.getElementById('newPassword').value
  };
  const res = await fetch('/api/password', {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json',
      'Authorization':'Bearer '+token
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  alert(data.message);
});

// Load profile on page load
loadProfile();
