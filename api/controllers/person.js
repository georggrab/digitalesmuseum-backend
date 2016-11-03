'use strict';
var util = require('util');
var mysql = require('mysql');
var async = require('async');

module.exports = {
  personGetAll: personGetAll,
  personGetSpecific: personGetSpecific,
  personAddNew: hello,
  personUpdateSpecific: hello,
  personDeleteSpecific: hello
};


var connection = mysql.createConnection({
  host: "141.31.8.88",
  user: "it",
  password: "xakixi94",
  database: "museum"
});

function groupResultByID(rows, push){
  var result = {};

  var atID = rows[0].id;
  result[atID] = [];

  for (var row of rows){
    if (!result.hasOwnProperty(row.id)){
      result[row.id] = [];
    }
    var obj = {};
    for (var column of push){
      obj[column] = row[column];
    }
    result[row.id].push(obj);
  }
  return result;
}

function selectAllQuery(callback){
  async.waterfall([
    function(next){
      connection.query("SELECT * FROM person", next);
    } , function(rows, fields, next) {
      async.parallel([
        function (callback){
          connection.query('SELECT * FROM `person` P \
            JOIN `person_image_tile` PIT ON P.ID=PIT.person_id  \
            JOIN `image_tiles` IT ON PIT.image_id=IT.id',
          function(err, rows, fields){
            var result = groupResultByID(rows, ["url", "source", "caption", "width", "height"]);
            callback(err, result);
          });
        }, function (callback){
          connection.query('SELECT * FROM `person` P \
            JOIN `person_text_tile` PTT ON P.ID=PTT.person_id \
            JOIN `text_tiles` IT ON PTT.text_tile_id=IT.id',
          function(err, rows, fields){
            var result = groupResultByID(rows, ["button_text", "long_text", "short_text"]);
            callback(err, result);
          });
          //connection.query();
        }, function (callback){
          connection.query('SELECT * FROM `person` P \
            JOIN `person_tags` PT ON P.id=PT.person_id \
            JOIN `tags` T ON PT.tag_id=T.id',
          function(err, rows, fields){
            var result = groupResultByID(rows, ["letter", "text"]);
            callback(err, result);
          });
          //connection.query();
        }, function (callback){
          connection.query('SELECT P.id, IT.caption, IT.height, IT.width, IT.source,\
            IT.url FROM `person` P JOIN `image_tiles` IT ON P.portrait_id=IT.id',
          function(err, rows, fields){
            var result = groupResultByID(rows, ["url", "caption", "source", "width", "height"]);
            callback(err, result);
          });
        }
      ],
      function (err, results){
        var tileTypes = ["imageTiles", "dataTiles", "chips", "portrait"]

        // Loop Person Resultset
        for (var person in rows){
          // Loop parallel executed queries
          for (var query_idx in results){
            // Map parallel query results into corresponding person
            rows[person][tileTypes[query_idx]] = results[query_idx][rows[person].id];
          }
        }
        next(null, rows);
      });

  }
  ], function (err, result){
    callback(result);
  });
}

// GET /person
function personGetAll(req, res) {
  var result = [];

  selectAllQuery(function(result){
    res.json({persons: result});
  });

}

// GET /person/{id}
function personGetSpecific(req, res){
  var id = req.swagger.params.id.value;
  selectAllQuery(function(result){
    async.filter(result, function(res, callback){
      callback(null, res.id === id);
    }, function(err, filtered){
      res.json(filtered[0]);
    });
  });
}

/*
  Functions in a127 controllers used for operations should take two parameters:

  Param 1: a handle to the request object
  Param 2: a handle to the response object
 */
function hello(req, res) {
  // variables defined in the Swagger document can be referenced using req.swagger.params.{parameter_name}
  //var name = req.swagger.params.name.value || 'stranger';
  var hello = util.format('Hello, shithead!!');

  // this sends back a JSON response which is a single string
  res.json(hello);
}
