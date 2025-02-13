const express = require("express");
const WebSocketServer = require('ws').Server;
const bodyParser = require('body-parser');
const app = express();
const port = process.env.port || 8080;
const JWTStrategy = require('@sap/xssec').JWTStrategy;
const xsenv = require("@sap/xsenv");
const passport = require("passport");

app.use(bodyParser.json());

passport.use(new JWTStrategy(xsenv.getServices({uaa:{tag:'xsuaa'}}).uaa));

app.use(passport.initialize());
app.use(passport.authenticate("JWT", { session: false }));

const server = app.listen(port, console.log(`Listening on port ${port}`));

const wss = new WebSocketServer({
    noServer: true,
    path: "/websocket/app"
});

function onSocketPreError(e){
    console.log('pre error')
    console.log(e);
}

function onSocketPostError(e){
    console.log('post error')
    console.log(e);
}

server.on('upgrade', (req, socket,head) => {
    socket.on('error', onSocketPreError);

    //perform auth - check to see if the req has the correct scope
    if (req.authInfo.checkScope('$XSAPPNAME.emmessenger')){
        wss.handleUpgrade(req, socket, head, (ws) => {
            socket.removeListener('error', onSocketPreError);
            wss.emit('connection', ws, req);
        });
    }
    else {
        socket.write('HTTP/1.1 401 unauthorised\r\n\r\n');
        socket.destroy();
        return;
    }
})

wss.on('connection', (ws, req) => {
    ws.on('error', onSocketPostError);

    ws.on('message', (msg, isBinary) => {
        wss.clients.forEach((client) => {
            console.log(client.readyState);
            client.send(msg, {binary: isBinary});
        })
    });

    ws.on('close', () => {
        console.log('connection closed');
    })
});

app.get("/", (req, res, next) => {
    if (req.authInfo.checkScope('$XSAPPNAME.emmessenger')){
        res.send("Welcome to the Event Mesh Node Application!");
    }
    else {
        res.status(403).send('Forbidden');
    }
});


