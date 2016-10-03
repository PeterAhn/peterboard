var express   = require('express');
var router    = express.Router();
var mongoose  = require('mongoose');
var Post      = require('../models/Post');
var Counter   = require('../models/Counter');
var async     = require('async');
var User      = require('../models/User');

router.get('/', function(req,res){
  var visitorCounter = null;
  var page = Math.max(1, req.query.page)>1?parseInt(req.query.page):1;
  var limit = Math.max(1, req.query.limit)>1?parseInt(req.query.limit):10;
  var search = createSearch(req.query);

  async.waterfall([function(callback){
    Counter.findOne({name:"visitors"}, function(err,counter){
      if(err) callback(err);
      visitorCounter = counter;
      callback(null);
      });
    }, function(callback) {
      if(!search.findUser) return callback(null);
      User.find(search.findUser, function(err,uesrs){
        if(err) callback(err);
        var or = [];
        users.forEach(function(user){
          or.push({author:mongoose.Types.ObjectId(user._id)});
        });
        if(search.findPost.$or){
          search.findPost.$or = search.findPost.$or.concat(or);
        } else if(or.length>0){
          search.findPost = {$or:or};
        }
        callback(null);
      });
    }, function(callback){
      if(search.findUser && !search.findPost.$or) return callback(null, null, 0);
      Post.count(search.findPost, function(err, count){
        if(err) return callback(err);
        skip = (page-1) * limit;
        maxPage = Math.ceil(count/limit);
        callback(null, skip, maxPage);
      });
    }, function(skip, maxPage, callback){
      if(search.findUser && !search.findPost.$or) return callback(null, [], 0);
      Post.find(search.findPost).populate("author").sort('-createAt').skip(skip).limit(limit).exec(function(err,posts){
        if(err) return callback(err);
        callback(null, posts, maxPage);
      });
    }], function(err, posts, maxPage) {
      if(err) return res.json({success:false, message:err});
      return res.render("posts/index", {
        posts:posts, user:req.user, page:page, maxPage:maxPage,
        urlQuery:req._parsedUrl.query, search:search,
        counter:visitorCounter, postsMessage:req.flash("postsMessage")[0]
      });
    });
}); // index

router.get('/new', isLoggedIn, function(req,res){
  res.render("posts/new", {user:req.user});
}); // new

router.post('/', isLoggedIn, function(req,res){
  req.body.post.author=req.user._id;
  Post.create(req.body.post, function(err,post){
    if(err) return res.json({success:false, message:err});
    res.redirect('/posts');
  });
}); // create;

router.get('/:id', function(req,res){
  Post.findById(req.params.id).populate("author").exec(function(err,post){
    if(err) return res.json({success:false, message:err});
    res.render("posts/show", {post:post, urlQuery:req._parsedUrl.query, user:req.user});
  });
}); // show

router.get('/:id/edit', isLoggedIn, function(req,res){
  Post.findById(req.params.id, function(err,post){
    if(err) return res.json({success:true, message:err});
    if(!req.user._id.equals(post.author)) return res.json({success:false, message:"Unauthrized Attempt"});
    res.render("posts/edit", {post:post, user:req.user});
  });
}); // edit

router.put('/:id', isLoggedIn, function(req,res){
  req.body.post.updatedAt=Date.now();
  Post.findByIdAndUpdate({_id:req.params.id, author:req.user._id}, req.body.post, function(err,post){
    if(err) return res.json({success:false, message:err});
    if(!post) return res.json({success:false, message:"No data found to update"});
    res.redirect('/posts/'+req.params.id);
  });
}); // update

router.delete('/:id', function(req,res){
  Post.findByIdAndRemove({_id:req.params.id, author:req.user._id}, function(err,post){
    if(err) return res.json({success:false, message:err});
    if(!post) return res.json({success:false, message:"No data found to delete"});
    res.redirect('/posts');
  });
}); // destroy

function isLoggedIn(req,res,next){
  if(req.isAuthenticated()){
    return next();
  }
  res.redirect('/login');
}

module.exports = router;

function createSearch(queries){
  var findPost = {}, findUser = null;
  if(queries.searchType && queries.searchText && queries.searchText.length >= 3) {
    var searchTypes = queries.searchType.toLowerCase().split(",");
    var postQueries = [];
    if(searchTypes.indexOf("title")>=0){
      postQueries.push({ title : { $regex : new RegExp(queries.searchText, "i") } });
    }
    if(searchTypes.indexOf("body")>=0){
      postQueries.push({ body : { $regex : new RegExp(queries.searchText, "i") } });
    }
    if(searchTypes.indexOf("author!")>=0){
      findUser = { nickname : queries.searchText };
    } else if(searchTypes.indexOf("author")>=0){
      findUser = { nickname : { $regex : new RegExp(queries.searchText, "i") } };
    }
    if(postQueries.length > 0) findPost = {$or:postQueries};
  }
  return { searchType:queries.searchType, searchText:queries.searchText,
    findPost:findPost};
}
