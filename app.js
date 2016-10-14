var requestURL = 'https://script.google.com/macros/s/AKfycbw-uVY9vpvLd1wJN1XpS5QRxOgHsHe2EvGrqTKSpNT89JnfwFA/exec' //Faneuil Hall
//var requestURL = 'https://script.google.com/macros/s/AKfycbz7CLS81nolWf_aXchoUrHb6BtRUKrCo_-AfIbzED1XBy_LXhE/exec' //CNY

var usbAutoDir = '/media/pi/809E-1BF2'
var videoStart = 'video.html' //effectively a blank page that could have an icon, etc. that appears before video plays and after video quits.
var videoEnd = 'video.html'
var videoDelay = 2000;

var express = require('express'),
    http = require('http');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var exec = require('child_process').exec;

server.listen(80);
var request = require('request');
var jsonStr='';
var jsonObj='';
var currentSlideURL=''
var currentSlideTitle=''

function makeRequest() {
request(requestURL, function (error, response, body) {
  if (!error && response.statusCode == 200) {
	  try {
	jsonStr = JSON.stringify(body);
	jsonObj = JSON.parse(body);
	var currentDate = new Date()
	var nextSlide = '';
	var nextSlideTitle = '';
	for(var x = 0; x < jsonObj.calendar.length; x++)
	{
		var startDate = new Date(jsonObj.calendar[x].start)
		var endDate = new Date(jsonObj.calendar[x].end)
		if(startDate < currentDate && currentDate < endDate)
		{
			//last one in wins
			nextSlide = jsonObj.calendar[x].url
			nextSlideTitle = jsonObj.calendar[x].title
		}
	}
	if(nextSlide.search("usb://") == 0)
	{
		nextSlide = "http://localhost/usb/" + nextSlide.split("usb://")[1]
	}
	if(nextSlide != currentSlideURL)
	{
		currentSlideURL = nextSlide
			currentSlideTitle = nextSlideTitle
			console.log(currentSlideTitle + " - " + currentSlideURL)
			io.emit('newSlide', currentSlideURL)
			console.log("emit newSlide")
	}
	else
	{
		console.log("Same slide")
	}

  }
  catch(err)
  {
	  console.log(err)
	  
  }
  }
	
});

}

io.on('connection', function(socket){
	console.log("ping")
	socket.on('currentSlide', function(){
		io.emit('currentSlide', currentSlideURL);
		//console.log("sent")
	});
});


makeRequest()
setInterval(function(){makeRequest()},60000)

app.get('/usb/:name', function (req, res) {
	  var options = {
    root: usbAutoDir,
    dotfiles: 'deny',
    headers: {
        'x-timestamp': Date.now(),
        'x-sent': true
    }
  };

  var fileName = req.params.name;
  
  if(fileName.search(".mp4" || ".mov") > -1) //if a movie, use omxplayer.
  {
	io.emit('currentSlide', "http://localhost/video/start");
	setTimeout(function(){
		exec("DISPLAY=:0 omxplayer " + usbAutoDir + "/" + fileName, function(error, stdout, stderr){
			if(error){
				console.log(error);
			}
			io.emit('currentSlide', "http://localhost/video/stop")
		})
	},videoDelay)
  }
  else
  {
  res.sendFile(fileName, options, function (err) {
    if (err) {
      console.log(err);
      res.status(err.status).end();
    }
    else {
      console.log('Sent:', fileName);
    }
  });
  }
});

app.get('/index.html', function (req, res) {
	request(currentSlideURL, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			res.sendFile("slide_manager.html",{root:__dirname})
  		}
	});
});

app.get('/video/:state', function (req, res) {
	if(req.params.state == "stop" )
	{
			res.sendFile(videoEnd,{root:__dirname})
	}
	else
	{
		res.sendFile(videoStart,{root:__dirname})
	}
	
});