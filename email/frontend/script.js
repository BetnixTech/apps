const API = "https://your-backend-url.com/api";

async function register(){
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const res = await fetch(`${API}/auth/register`,{
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ name,email,password })
  });
  const data = await res.json();
  alert(JSON.stringify(data));
}

async function login(){
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const res = await fetch(`${API}/auth/login`,{
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ email,password })
  });
  const data = await res.json();
  if(data.token) localStorage.setItem("token",data.token);
  alert(JSON.stringify(data));
}