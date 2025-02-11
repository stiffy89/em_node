const express = require("express");
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

app.get("/", (req, res, next) => {
    if (req.authInfo.checkScope('$XSAPPNAME.sample1viewer')){
        res.send("Welcome to the Event Mesh Node Application!");
    }
    else {
        res.status(403).send('Forbidden');
    }
});


