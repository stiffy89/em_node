const express = require("express");
const WebSocketServer = require('ws').Server;
const bodyParser = require('body-parser');
const app = express();
const port = process.env.port || 8080;
const JWTStrategy = require('@sap/xssec').JWTStrategy;
const xsenv = require("@sap/xsenv");
const passport = require("passport");
const url = require("url");

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

server.on('upgrade', (req, socket, head) => {

    socket.on('error', onSocketPreError);

    //perform auth - check to see if the req has the correct scope
    if (req.headers['sec-websocket-protocol']){
        let aProtocols = req.headers['sec-websocket-protocol'].split(',');
        let aFilteredProtocols = aProtocols.filter(x => {
            return (x.indexOf('emmessenger') >= 0)
        })

        if (aFilteredProtocols.length > 0){
            wss.handleUpgrade(req, socket, head, (ws) => {
                socket.removeListener('error', onSocketPreError);
                wss.emit('connection', ws, req);
            });

            return;
        }
    }

    console.log('unauthorised');
    socket.write('HTTP/1.1 401 unauthorised\r\n\r\n');
    socket.destroy();
    return;
})

function generateHexCode () {
    let n = (Math.random() * 0xfffff * 1000000).toString(16);
    return '#' + n.slice(0, 6);
}

wss.on('connection', (ws, req) => {

    const hexCode = generateHexCode();

    //https://medium.com/@finnkumar6/understanding-url-in-node-js-a-simple-guide-341cf48af8b7
    //node module will break down the query into its components for us in an object format
    const parameters = url.parse(req.url, true);
    ws._id = parameters.query.customId;
    ws._hexcode = hexCode;

    //notify all the rest of the connected clients that there are someone new
    wss.clients.forEach((client) => {
        if (client.readyState == 1){
            
            const message = {
                'type' : 'usertraffic',
                'messageBody' : {
                    'type' : 'userstatus',
                    'status' : 'join',
                    'user' : ws._id
                }
            }

            client.send(JSON.stringify(message));
        }
    });


    ws.on('error', onSocketPostError);

    ws.on('message', (msg, isBinary) => {
        wss.clients.forEach((client) => {
            console.log(client.readyState);
            client.send(msg, {binary: isBinary});
        })
    });

    ws.on('close', () => {
        //notify the other websocket clients that are connected that this person has left
        wss.clients.forEach((client) => {
            if (client.readyState == 1){
                
                const message = {
                    'type' : 'usertraffic',
                    'messageBody' : {
                        'type' : 'userstatus',
                        'status' : 'leave',
                        'user' : ws._id
                    }
                }
    
                client.send(JSON.stringify(message));
            }
        });
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

app.post("/NewMessage", (req, res) => {

    let msgBody = req.body;

    msgBody['type'] = 'message';

    let message = {
        "type" : "message",
        "messageBody" : msgBody 
    }

    //whenever we recieve a message from the queue
    //we will forward this to all our connected clients
    wss.clients.forEach((client) => {
        if (client.readyState == 1){
            message.messageBody["hexcode"] = client._hexcode;
            client.send(JSON.stringify(message));
        }
    });

    res.status(200).end();
});

let aCurrentlyTyping = [];

app.post("/Typing", (req,res) => {
    let typingStatus = req.body;

    if (typingStatus.isTyping){
        if (aCurrentlyTyping.indexOf(typingStatus.personTyping) == -1){
            aCurrentlyTyping.push(typingStatus.personTyping);
        }
    } else {
        if (aCurrentlyTyping.indexOf(typingStatus.personTyping) >= 0){
            const iFindIndex = aCurrentlyTyping.findIndex(x => x === typingStatus.personTyping);
            aCurrentlyTyping.splice(iFindIndex , 1);
        }
    }

    //send the whole thing across
    const message = {
        "type" : "status",
        "currentlyTyping" : aCurrentlyTyping
    }

    wss.clients.forEach((client) => {
        if (client.readyState == 1){
            client.send(JSON.stringify(message));
        }
    });

    res.status(200).end();
})




