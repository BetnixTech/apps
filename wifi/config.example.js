module.exports = {
  MONGO_URI: "mongodb://localhost:27017/raspi-router",
  SESSION_SECRET: "change_this_to_a_secure_random_value",
  PORT: 3000,

  // Betnix OAuth — fill from your Oauth repo / client
  OAUTH: {
    clientID: "BETNIX_CLIENT_ID",
    clientSecret: "BETNIX_CLIENT_SECRET",
    authorizationURL: "https://betnix.example/oauth/authorize",
    tokenURL: "https://betnix.example/oauth/token",
    callbackURL: "http://your-pi-host:3000/auth/betnix/callback",
    userProfileURL: "https://betnix.example/oauth/userinfo"
  },

  // Which system interfaces to manage
  ROUTER: {
    WIFI_IFACE: "wlan0",
    WAN_IFACE: "eth0"
  },

  // Admins (optional list of allowed Betnix account ids)
  ADMINS: ["betnix-admin-id-1"]
};
