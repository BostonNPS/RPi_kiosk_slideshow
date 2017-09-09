
//GLOBALS AND DEPENDENCIES
	var express = require('express');
	var bodyParser = require('body-parser');
	var multer = require('multer');
	var upload = multer({dest:'uploads/'});
	var app = express();
	var server = require('http').Server(app);
	var io = require('socket.io')(server);
	var mongo = require('mongodb').MongoClient;
	var ObjectID = require('mongodb').ObjectID;
	var exec = require('child_process').exec;
	var RRule = require('rrule').RRule
	var RRuleSet = require('rrule').RRuleSet
	var rrulestr = require('rrule').rrulestr

	// Connection URL
	var DBurl = 'mongodb://localhost:27017/slideshow';
	
	
	var DEFAULT_SCHEDULE = {
		"name":"DEFAULT_SCHEDULE",
		//"valid":{"start":new Date(),"permanent":true},
		"order":[defaultSlideId],
		//"RRULE":"RRULE:DTSTART=" + new Date().toISOString() + ";FREQ=DAILY;INTERVAL=1",
		"_id": new ObjectID()
		}
	var DEFAULT_SLIDE = {
		"name":"DEFAULT_SLIDE",
		"duration":"60",
		"content_type":"Web",
		"content":"https://go.nps.gov/todayinboston",
		"_id":defaultSlideId
		}
		
	var CURRENT_SCHEDULE_DOCUMENT = DEFAULT_SCHEDULE;
	//var CURRENT_SCHEDULE = "";
	var CURRENT_SLIDE = 0;
	var SLIDE_TIMER = -1;
	var defaultSlideId = new ObjectID()//generate an ID on start.

//-------------------------------------------
//mongodb callback functions defined here
//-------------------------------------------
	function find(query, collection, callback) {
		mongo.connect(DBurl, function(err, db) {
			if(err)
			{
				console.log(err)
			}
			else
			{
				db.collection(collection).find(query).toArray(function (err, docs){
					if(err)
					{
						console.log(err)
					}
					else
					{
						callback(docs)
					}
				});
				db.close();
			}
		});
	}
	function del(query, collection, callback) {
		mongo.connect(DBurl, function(err, db) {
			if(err)
			{
				console.log(err)
			}
			else
			{
				db.collection(collection).deleteOne(query,function (err, docs){
					if(err)
					{
						console.log(err)
					}
					else
					{
						callback(docs)
					}
				});
				db.close();
			}
		});
	}
	function edit(id,object,collection,callback) { //use id of response plus new message
		mongo.connect(DBurl, function(err,db){
			if(err)
			{
				console.log(err)
			}
			else
			{
				db.collection(collection).update({"_id" : new ObjectID(id)},{"$set":object},function(err,results){
				if(err)
				{
					console.log(err);
				}
				else
				{
					callback(results);
				}
			});
			db.close();
			}
		});
	}
	function newDoc(q,collection,callback) { //q is a valid document object to insert into collection
		mongo.connect(DBurl, function(err,db){
			if(err)
			{
				console.log(err)
			}
			else
			{
				db.collection(collection).insertOne(q,function(err,docs){
					if(err)
					{
						console.log(err);
					}
					else
					{
						callback(q);
					}
				});
				db.close();
			}
		});
	}

//-----------------------
//EXPRESS ROUTING
//-----------------------

	//-------------
	//Static delivery of public pages/libraries etc
	//-------------
		//Default root is to reply with client slideshow app webpage.
		app.get("/",function(req,res){
			res.sendFile(__dirname + '/slideshow.html');
		});
		app.use(bodyParser.json()); // for parsing application/json
		app.use(express.static('uploads'));
		app.use(express.static('js'));
		app.use(express.static('css'));
		app.use("/rrule/", express.static(__dirname + '/node_modules/rrule/'));
		app.use("/uploads/", express.static(__dirname + '/uploads/'));
		
	//----------------
	//ADMIN authentication protected functions/API endpoints
	//----------------
		app.all("/admin/*",function(req,res,next){
			
			//Thanks to user "qwerty" on stackoverflow for a basic and compact auth comparison algorithm solution
			
			var auth = {login:"kiosk",password:"slideshow"}
			console.log(auth.login + " " + auth.password)
			var b64auth = (req.headers.authorization || '').split(' ')[1] || '';
			var login = new Buffer(b64auth, "base64").toString().split(':')[0];
			var password = new Buffer(b64auth, "base64").toString().split(':')[1];
			
			if(!login || ! password || login !== auth.login || password !== auth.password)
			{
				res.set('WWW-Authenticate','Basic realm="thoughtAdmin"');
				res.status(401).send("User/Pass pls!");
				console.log("Failed admin logon request")
				return
			}
			console.log("accepted logon from " + req.ip)
			next();
		});

		//admin panel html page.
		app.get('/admin/', function(req, res){
			res.sendFile(__dirname + '/admin.html');
		});
		//admin schedule page and RESTful commands
		app.get('/admin/schedule', function(req, res){
			res.sendFile(__dirname + '/schedule_admin.html');
		});
		app.post('/admin/schedule/update/:id', function(req, res){
			console.log(req.body);
			if(req.body.valid.start)
			{
				req.body.valid.start = new Date(req.body.valid.start);
			}
			if(req.body.valid.end)
			{
				req.body.valid.end = new Date(req.body.valid.end);
			}
			edit(req.params.id,req.body,"schedule",function(results){res.sendStatus(200)})
		});
		app.post('/admin/schedule/new', function(req, res){
			console.log(req.body);
			if(req.body.valid.start)
			{
				req.body.valid.start = new Date(req.body.valid.start);
			}
			if(req.body.valid.end)
			{
				req.body.valid.end = new Date(req.body.valid.end);
			}
			newDoc(req.body,"schedule",function(results){res.sendStatus(200)})
		});
		app.get('/admin/schedule/delete/:id', function(req, res){
			del({"_id":new ObjectID(req.params.id)},"schedule",function(results){console.log(results);res.sendStatus(200)})
		});

		//admin slide page and RESTful commands
		app.get('/admin/slide', function(req, res){
			res.sendFile(__dirname + '/slide_admin.html');
		});
		app.post("/admin/slide/update/:id", upload.fields([{name:"content-image"},{name:"content-video"}]),function(req, res){
			var submitObj = req.body;
			switch(submitObj.content_type) {
				case "Web":
					submitObj.content = req.body['content-url'];
					break;
				case "Image":
					submitObj.content = req.files['content-image'][0].path;
					submitObj['content-image'] = req.files['content-image'][0];
					break;
				case "Video":
					submitObj.content = req.files['content-video'][0].path;
					submitObj['content-video'] = req.files['content-video'][0];
					break;
			}
			edit(req.params.id,submitObj,"slides",function(results){res.sendStatus(200)})
		});
		app.post("/admin/slide/new", upload.fields([{name:"content-image"},{name:"content-video"}]),function(req, res){
			var submitObj = req.body;
			switch(submitObj.content_type) {
				case "Web":
					submitObj.content = req.body['content-url'];
					break;
				case "Image":
					submitObj.content = req.files['content-image'][0].path;
					submitObj['content-image'] = req.files['content-image'][0];
					break;
				case "Video":
					submitObj.content = req.files['content-video'][0].path;
					submitObj['content-video'] = req.files['content-video'][0];
					break;
			}
			console.log(submitObj);
			newDoc(submitObj,"slides",function(results){res.sendStatus(200)})
		});
		
	//--------------------------
	//REGULAR CLIENT API RESTful CALLS
	//--------------------------
		//get specific slide JSON by ID
		app.get("/slides/:id?", function(req, res){
			if(!req.params.id){
				find({},"slides",function(docs){
					res.json(docs);
				});
			}
			else
			{
				find({"_id":new ObjectID(req.params.id)},"slides",function(docs){
					res.json(docs);
				});
			}
		});
		//Get current valid scheduled sideshows
		app.get("/schedule/current", function(req, res){
			console.log('{"valid.end":{$gt:new Date().toISOString()},"valid.start":{$lt:new Date().toISOString()}}')
			find({$or:[{"valid.end":{$gt:new Date()},"valid.start":{$lt:new Date()}},{"valid.permanent":true}]},"schedule",function(docs){
					res.json(docs);
			});
		});

		//get all schedules ever created.
		app.get("/schedule/all", function(req, res){
			find({},"schedule",function(docs){
					res.json(docs);
			});
		});

		//get specific schedule by id
		app.get("/schedule/:id", function(req, res){
			find({"_id":new ObjectID(req.params.id)},"schedule",function(docs){
				res.json(docs);
			});
		});
		
		//get slide that is currently playing
		app.get("/currentslide",function(req,res){
			//console.log(currentSlideDocument);
			getSlide(CURRENT_SCHEDULE_DOCUMENT.order[CURRENT_SLIDE],function(slideDoc){
				console.log(slideDoc);
				res.json(slideDoc);
			});
		});


//-------------------------------------------
//Functions handling the slideshow schedule based off user-defined schedules and slideshows
//-------------------------------------------

	//-------------------------------------
	//TIMEKEEPER FOR SLIDES AND CURRENT SCHEDULE
	//------------------------------------
	setInterval(function(){ //fires every second to evaluate schedules and current slides.
		figureSchedule(function(calc_sched_doc){
			if(!CURRENT_SCHEDULE_DOCUMENT || !(new ObjectID(CURRENT_SCHEDULE_DOCUMENT._id).equals(new ObjectID(calc_sched_doc._id))))//something has has changed in SCHEDULES...so redo that bit.
			{
				CURRENT_SCHEDULE_DOCUMENT = calc_sched_doc;
				CURRENT_SLIDE = 0;
				console.log("now playing schedule " + CURRENT_SCHEDULE_DOCUMENT.name)
				getSlide(CURRENT_SCHEDULE_DOCUMENT.order[CURRENT_SLIDE],function(slideDoc){
					SLIDE_TIMER = slideDoc.duration;
					console.log("\t slide " + slideDoc.name)
					io.emit('nextSlide',JSON.stringify(slideDoc))
				});
				
			}
			else //otherwise continue as normal.
			{
				if(SLIDE_TIMER > 0)
				{
					SLIDE_TIMER--;
				}
				else
				{
					if(SLIDE_TIMER == 0)
					{
						if(CURRENT_SLIDE < CURRENT_SCHEDULE_DOCUMENT.order.length - 1)
						{
							CURRENT_SLIDE++;
						}
						else
						{
							CURRENT_SLIDE = 0;
						}
						getSlide(CURRENT_SCHEDULE_DOCUMENT.order[CURRENT_SLIDE],function(slideDoc){
							SLIDE_TIMER = slideDoc.duration;
							console.log("\t slide " + slideDoc.name)
							io.emit('nextSlide',JSON.stringify(slideDoc))
						});
					}
					else
					{
						//console.log("no slide here...something default should happen?")
					}
				}
			}
		});
	},1000);
	
	
	//this just saves you from specifying to use the slides collection in the db...
	function getSlide(id,callback){
	find({"_id":new ObjectID(id)},"slides",function(docs){
		if(docs[0])
		{
			callback(docs[0]);
		}
		else
		{
			callback(DEFAULT_SLIDE);
		}
	});
	
}
	//logic for figuring the schedule side of things.
	function figureSchedule(callback){
		find({$or:[{"valid.end":{$gt:new Date()},"valid.start":{$lt:new Date()}},{"valid.permanent":true}]},"schedule",function(docs){
			var now = new Date();
			var startBetween = new Date(now.getTime() - 43200000); //12 hours ago from NOW
			var endBetween = new Date(now.getTime() + 43200000); //12 hours from NOW
			var schedules = []
			for(x in docs)
			{
				if(docs[x].rrule)
				{
					var rule = rrulestr(docs[x].rrule.replace(",","\n"),{forceset: true});//parse RRule string.
					var projection = rule._rrule[0].between(startBetween,endBetween); //current 24 hour period.
					for(y in projection)
					{
						schedules.push({"dateTime" : projection[y],"schedule":docs[x]})
					}
				}
			}
			schedules.push({"dateTime" : now,"schedule":{"name":"RIGHT NOW."}})
			schedules.sort(function(a,b){
				if (a.dateTime < b.dateTime)
					return -1;
				if (a.dateTime > b.dateTime)
					return 1;
			});
			for(var x = 0; x < schedules.length; x++)
			{
				if(now == schedules[x].dateTime)
				{
					//console.log(schedules[x-1].dateTime +":"+schedules[x-1].schedule.name);
					//console.log(schedules[x].dateTime +":"+schedules[x].schedule.name);
					//console.log(schedules[x+1].dateTime +":"+schedules[x+1].schedule.name);
					if(schedules[x-1])
					{
						callback(schedules[x-1].schedule);
					}
					else
					{
						//default action because nothing is available/matches current schedule.
					}
					break;
				}
			}
			//CURRENT_SCHEDULE = 0;
			//console.log("Playing current schedule of " + MASTER_CURRENT_SCHEDULES[CURRENT_SCHEDULE].schedule.name);
			//getSlide(MASTER_CURRENT_SCHEDULES[CURRENT_SCHEDULE].schedule.order[CURRENT_SLIDE],function(slideDoc){
			//	SLIDE_TIMER = slideDoc.duration;
			//	io.emit('nextSlide',JSON.stringify(slideDoc))
			});
	}


server.listen(80);
