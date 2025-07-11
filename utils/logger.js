const fs = require('fs');
const path = require('path');

const logActivity = (entry) => {
  const filePath = path.join(__dirname, '../activity-log.json');
  const logs = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath))
    : [];

  logs.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
};

module.exports = { logActivity };
