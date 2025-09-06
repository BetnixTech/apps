const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();

// Serve frontend HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Dynamic Betnix font CSS endpoint
app.get('/fonts/css/:fontName.css', async (req, res) => {
  const fontName = req.params.fontName;

  // Build Google Fonts URL
  const googleUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}&display=swap`;

  try {
    // Fetch the CSS from Google Fonts
    const response = await axios.get(googleUrl);
    const css = response.data;

    // Return CSS to client
    res.setHeader('Content-Type', 'text/css');
    res.send(css);

  } catch (err) {
    res.status(404).send(`Font "${fontName}" not found on Google Fonts`);
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Betnix Fonts API running on port ${PORT}`));
