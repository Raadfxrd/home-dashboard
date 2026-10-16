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

const issueLog = require('./lib/issueLog');
// Before anything else logs, so every warning and error is collected.
issueLog.install();

const express = require('express');
const cors = require('cors');

const weatherRoutes = require('./routes/weather');
const homeRoutes = require('./routes/home');
const jellyfinRoutes = require('./routes/jellyfin');
const upcomingRoutes = require('./routes/upcoming');
const containerRoutes = require('./routes/containers');
const calendarRoutes = require('./routes/calendar');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
	res.json({status: 'ok', timestamp: new Date().toISOString()});
});

// What went wrong recently, for the log in the dashboard's bottom bar.
app.get('/api/logs', (_req, res) => {
	res.json({entries: issueLog.list(), clearedAt: issueLog.clearedAt()});
});
app.post('/api/logs/clear', (_req, res) => {
	issueLog.clear();
	res.json({ok: true});
});

app.use('/api/weather', weatherRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/jellyfin', jellyfinRoutes);
app.use('/api/upcoming', upcomingRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/calendar', calendarRoutes);

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
