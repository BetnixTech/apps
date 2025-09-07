import pyttsx3
import speech_recognition as sr
from transformers import GPT2LMHeadModel, GPT2Tokenizer
from kasa import SmartBulb, SmartPlug
import smtplib
import socket
import json
import RPi.GPIO as GPIO
import threading
import asyncio

# -------------------------------
# TTS setup
# -------------------------------
engine = pyttsx3.init()
def speak(text):
    print("AI:", text)
    engine.say(text)
    engine.runAndWait()

# -------------------------------
# GPT-2 AI setup
# -------------------------------
tokenizer = GPT2Tokenizer.from_pretrained("gpt2")
model = GPT2LMHeadModel.from_pretrained("gpt2")
def generate_response(prompt):
    inputs = tokenizer.encode(prompt, return_tensors="pt")
    outputs = model.generate(
        inputs, max_length=150, do_sample=True, temperature=0.7, pad_token_id=tokenizer.eos_token_id
    )
    text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return text[len(prompt):].strip()

# -------------------------------
# IP validation
# -------------------------------
def check_ip(ip, port=80, timeout=2):
    try:
        sock = socket.create_connection((ip, port), timeout)
        sock.close()
        return True
    except:
        return False

# -------------------------------
# Load devices and users from JSON
# -------------------------------
try:
    with open('devices.json','r') as f:
        devices = json.load(f)
except:
    devices = {}

try:
    with open('users.json','r') as f:
        users = json.load(f)
except:
    users = []

def save_devices():
    with open('devices.json','w') as f:
        json.dump(devices,f,indent=2)

def save_users():
    with open('users.json','w') as f:
        json.dump(users,f,indent=2)

# -------------------------------
# Email notifications
# -------------------------------
EMAIL_PROVIDERS = {
    "gmail.com": {"smtp": "smtp.gmail.com", "port": 587},
    "betnix.com": {"smtp": "smtp.betnix.com", "port": 587},
    "yahoo.com": {"smtp": "smtp.mail.yahoo.com", "port": 587},
    "outlook.com": {"smtp": "smtp.office365.com", "port": 587},
    "hotmail.com": {"smtp": "smtp.live.com", "port": 587},
    # Add more providers here
}

def send_email(user_email, password, to_email, subject, body):
    try:
        domain = user_email.split("@")[1].lower()
        if domain not in EMAIL_PROVIDERS:
            print(f"Unsupported email provider for {user_email}")
            return False
        smtp_server = EMAIL_PROVIDERS[domain]["smtp"]
        port = EMAIL_PROVIDERS[domain]["port"]
        with smtplib.SMTP(smtp_server, port) as server:
            server.starttls()
            server.login(user_email, password)
            server.sendmail(user_email, to_email, f"Subject: {subject}\n\n{body}")
        return True
    except Exception as e:
        print(f"Email error for {user_email}: {e}")
        return False

# -------------------------------
# GPIO setup for Pi devices
# -------------------------------
GPIO.setmode(GPIO.BCM)
PI_PINS = {"front_door":17, "living_light":27}
for pin in PI_PINS.values():
    GPIO.setup(pin, GPIO.OUT)

# -------------------------------
# Device control
# -------------------------------
async def control_kasa(ip, state, dtype):
    try:
        device = SmartBulb(ip) if dtype=="light" else SmartPlug(ip)
        await device.update()
        if state:
            await device.turn_on()
        else:
            await device.turn_off()
        return True
    except Exception as e:
        print(f"Kasa control error ({ip}): {e}")
        return False

def control_pi(pin_name, state):
    pin = PI_PINS.get(pin_name)
    if pin is not None:
        GPIO.output(pin, state)
        return True
    return False

def set_device(room, dtype, state):
    if room in devices and dtype in devices[room]:
        dev = devices[room][dtype]
        dev['state'] = state
        save_devices()
        # Control hardware
        if dev.get('type')=="kasa":
            asyncio.run(control_kasa(dev['ip'], state, dtype))
        elif dev.get('type')=="pi":
            control_pi(dev['pin'], state)
        # Email notifications
        for user in users:
            if 'email' in user and 'password' in user:
                send_email(user['email'], user['password'],
                           user['email'],
                           f"{dtype} in {room} changed",
                           f"{dtype} in {room} is now {'On' if state else 'Off'}")
        speak(f"{dtype} in {room} turned {'on' if state else 'off'}")

# -------------------------------
# Voice AI listener
# -------------------------------
def listen_loop():
    recognizer = sr.Recognizer()
    mic = sr.Microphone()
    print("Listening for 'Hey Betnix'...")
    while True:
        with mic as source:
            recognizer.adjust_for_ambient_noise(source)
            audio = recognizer.listen(source)
        try:
            text = recognizer.recognize_google(audio).lower()
            if "hey betnix" in text:
                command = text.replace("hey betnix","").strip()
                handle_command(command)
        except:
            continue

# -------------------------------
# Command handling
# -------------------------------
def handle_command(cmd):
    response = "I didn't understand that."
    for room, room_devices in devices.items():
        for dtype, dev in room_devices.items():
            if dtype in cmd or room in cmd:
                if "on" in cmd or "unlock" in cmd:
                    set_device(room, dtype, True)
                    response = f"{dtype} in {room} turned on"
                elif "off" in cmd or "lock" in cmd:
                    set_device(room, dtype, False)
                    response = f"{dtype} in {room} turned off"
    if response=="I didn't understand that.":
        response = generate_response(cmd)
        speak(response)

# -------------------------------
# Main
# -------------------------------
if __name__=="__main__":
    threading.Thread(target=listen_loop, daemon=True).start()
    speak("Betnix Home Assistant ready. Say 'Hey Betnix' to start.")
    print("Betnix AI running. Press Ctrl+C to exit.")
    try:
        while True:
            pass
    except KeyboardInterrupt:
        GPIO.cleanup()
