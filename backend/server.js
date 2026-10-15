const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envCandidates = [
	path.resolve(process.cwd(), '.env'),
	path.resolve(__dirname, '.env'),
	path.resolve(__dirname, '..', '.env'),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
dotenv.config(envPath ? {path: envPath} : undefined);

const express = require('express');
const cors = require('cors');

const weatherRoutes = require('./routes/weather');
const homeRoutes = require('./routes/home');
const jellyfinRoutes = require('./routes/jellyfin');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
	res.json({status: 'ok', timestamp: new Date().toISOString()});
});

app.use('/api/weather', weatherRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/jellyfin', jellyfinRoutes);

// In the Docker image the built frontend sits next to the server, so one
// container serves both. In dev, Vite serves the frontend and this is skipped.
const staticDir = process.env.STATIC_DIR || path.resolve(__dirname, 'public');
if (fs.existsSync(path.join(staticDir, 'index.html'))) {
	app.use(express.static(staticDir, {index: false, maxAge: '1h'}));
	app.get(/^(?!\/api\/).*/, (_req, res) => {
		res.sendFile(path.join(staticDir, 'index.html'));
	});
}

app.use((_req, res) => {
	res.status(404).json({error: 'Not found'});
});

app.use((err, _req, res, _next) => {
	console.error(err.stack);
	res.status(500).json({error: 'Internal server error'});
});

app.listen(PORT, () => {
	console.log(`Backend running on port ${PORT}`);
});
