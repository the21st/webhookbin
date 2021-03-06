const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bodyParser = require('body-parser');
const _ = require('lodash/core');
const {promisify} = require('util');

const readFileAsync = promisify(fs.readFile); // (A)

const DATA_DIR = os.tmpdir();

const app = express();

// create application/json parser
const jsonParser = bodyParser.json();

PORT = process.env.PORT || 8877;
TOKEN = process.env.TOKEN || 'bda98695-b53e-4a63-a9c5-8b115ba6539c';

app.get(`/${TOKEN}`, (req, res) => res.send('Simple Web Server!'));

app.enable('trust proxy');

app.use((req, res, next) => {
    res.set('Content-Type', 'text/plain');
    next()
});

app.use(`/${TOKEN}/:bucket_name`, (req, res, next) => {
    if (!req.params['bucket_name'].match(/^[A-Za-z0-9_-]+$/)) {
        console.error("Invalid bucket name: " + req.params['bucket_name']);
        return res.status(400).send('Invalid bucket name. Please use only letters, numbers, underscore and dash.');
    }
    next()
});

app.get(`/${TOKEN}/:bucket_name`, (req, res, next) => {
    const bucket_dir = path.join(DATA_DIR, req.params['bucket_name']);

    if (!fs.existsSync(bucket_dir)) {
        fs.mkdirSync(bucket_dir);
    }
    fs.readdir(bucket_dir, (err, files) => {
        if (err) return next(err);

        const files_subset = files.sort().reverse().slice(0, 100);
        if (files_subset.length === 0) {
            res.write("No requests in this bucket yet. Send POST request to this URL and check again.");
            res.write("\n");
            res.write("Sample curl call:");
            res.write("\n");
            const full_url = req.protocol + '://' + req.get('host') + '/' + TOKEN + '/' + req.params['bucket_name'];
            res.write(`curl -X POST -H "Content-Type: application/json" --data '{"hello": "world"}' ${full_url}`);
            res.write("\n");

            res.end()
        }

        Promise.all(files_subset.map((filename) => {
            return readFileAsync(path.join(bucket_dir, filename)).then((content) => {
                return [
                    "============ " + filename + " ============",
                    content,
                    "=======================================================",
                    "\n"
                ].join("\n");
            });
        })).then((webhookLogs) => {
            webhookLogs.forEach((log) => res.write(log));
            res.end()
        });
    });
});

app.post(`/${TOKEN}/:bucket_name`, jsonParser, (req, res, next) => {
    if (_.isEmpty(req.body)) {
        return res
            .status(400)
            .send("Invalid request. Only application/json requests are supported. " +
                "Make sure, you are setting Content-Type header correctly.");
    }
    const bucket_dir = path.join(DATA_DIR, req.params['bucket_name']);
    if (!fs.existsSync(bucket_dir)) {
        fs.mkdirSync(bucket_dir);
    }
    const timestamp = new Date().toISOString();
    const filename = timestamp + '.json';
    const file_path = path.join(bucket_dir, filename);
    const content = JSON.stringify(req.body, null, 2);
    fs.writeFile(file_path, content, (err) => {
        if (err) {
            console.error("Failed to write to file: " + file_path + ". Content: " + content);
            return next(err)
        }
        console.log("Successfully recorded request for bucket: " + req.params['bucket_name']);

        res.send('Accepted');
    });
});

app.use((req, res, next) =>
    res.status(404).send("Page not found. Maybe invalid token?")
);

app.listen(PORT, () => console.log(`Webhook bin listening on port ${PORT}!`));
