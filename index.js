"use strict";

var express = require('express')
var app = express()
var proxy = require('express-http-proxy')
var helmet = require('helmet')
var session = require('express-session')

var compression = require('compression')

// compress all requests
app.use(compression())

//some security
app.use(helmet())

//shouldn't be in server file.
var k = require('./react/src/scripts/api/kiva')
const KLPageSplits = k.KLPageSplits

/**
app.use(express.compress())
app.use(express.json())
app.use(express.urlencoded())
app.use(express.bodyParser())
app.use(express.methodOverride())
app.use(express.cookieParser())
**/

//session stuff (unused at this point)
//app.set('trust proxy', 1) // trust first proxy
/** app.use( session({
        secret : 'k15yWt1w2k5M45Wrb1V02PzBqXuBjUsN', //switch to heroku config once I use this in prod.
        name : 'sessionId',
    })
)**/

var loans = []
var loanChunks = []

const proxyHandler = {
    forwardPath: function(req, res) {
        return require('url').parse(req.url).path;
    },
    intercept: function(rsp, data, req, res, callback){
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'X-Requested-With, Accept, Origin, Referer, User-Agent, Content-Type, Authorization, X-Mindflash-SessionID');

        // intercept OPTIONS method
        if ('OPTIONS' == req.method) {
            res.send(200)
        } else {
            callback(null,data)
        }
    }
}

app.use('/proxy/kiva', proxy('https://www.kiva.org', proxyHandler))
app.use('/proxy/gdocs', proxy('https://docs.google.com', proxyHandler))

app.set('port', (process.env.PORT || 3000))

app.use(express.static(__dirname + '/public'))

// views is directory for all template files
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

app.get('/', function(request, response) {
  response.render('pages/index')
})

app.get('/loans/get', function(request, response) {
    var page = parseInt(request.param('page'))
    if (page) {
        if (page > KLPageSplits) {
            response.send(404)
            return
        }
        response.send(JSON.stringify(loanChunks[page - 1]))
    } else {
        response.send(loans)
    }
})

app.get('/loans/start', function(request, response){
    response.send(JSON.stringify({pages: loanChunks.length, total: loans.length}))
})

app.get('/loans/fetch', function(request, response){
    response.send("Started fetch from Kiva")
    fetchLoans()
})

//any page not defined in this file gets routed to everything which redirects to /#/search
app.get('/*', function(request, response) {
    response.render('pages/everything') //can i do permanent redirect?
})

app.listen(app.get('port'), function() {
  console.log('KivaLens Server is running on port', app.get('port'))
})

Array.prototype.chunk = function(chunkSize) {
    var R = []
    for (var i=0; i<this.length; i+=chunkSize)
        R.push(this.slice(i,i+chunkSize))
    return R
}

fetchLoans()

//get all loans.
function fetchLoans() {
    const LoansSearch = k.LoansSearch
    k.setAPIOptions({app_id: 'org.kiva.kivalens'})

    new LoansSearch({}, true, null, true).start().done(allLoans => {
        console.log("Loans received!")
        allLoans.forEach(loan => {
            loan.description.languages.where(lang => lang != 'en').forEach(lang => delete loan.description.texts[lang])
            delete loan.terms.local_payments
            delete loan.journal_totals
            delete loan.translator
            delete loan.location.geo
        })
        loans = allLoans
        var chunkSize = Math.ceil(allLoans.length / KLPageSplits)
        loanChunks = allLoans.chunk(chunkSize)

        console.log("Loans ready!")
    })
}

setInterval(fetchLoans,5*60000)

//require("./MongoTest")