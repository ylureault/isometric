// Phase 1: Simple static file server
// Socket.io will be added in Phase 2

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// Root redirects to landing page
app.get('/', (req, res) => {
  res.redirect('/client/index.html');
});

app.listen(PORT, () => {
  console.log(`Espace Collaboratif running at http://localhost:${PORT}`);
});
