'use strict';
var util = require('util');
var mysql = require('mysql');
var async = require('async');

module.exports = {
    personGetAll: personGetAll,
    personGetSpecific: personGetSpecific,
    personAddNew: personAdd,
    personUpdateSpecific: hello,
    personDeleteSpecific: personDeleteSpecific
};


var connection = mysql.createConnection({
    host: "141.31.8.88",
    user: "it",
    password: "xakixi94",
    database: "museum"
});

function groupResultByID(rows, push) {
    var result = {};
    if (rows.length < 1) return result;

    var atID = rows[0].id;
    result[atID] = [];

    for (var row of rows) {
        if (!result.hasOwnProperty(row.id)) {
            result[row.id] = [];
        }
        var obj = {};
        for (var column of push) {
            obj[column] = row[column];
        }
        result[row.id].push(obj);
    }
    return result;
}

function selectAllQuery(callback) {
    async.waterfall([
        function(next) {
            connection.query("SELECT * FROM person", next);
        },
        function(rows, fields, next) {
            async.parallel([
                    function(callback) {
                        connection.query('SELECT P.id, IT.url, IT.source, IT.caption, IT.width, IT.height FROM `person` P \
            JOIN `person_image_tile` PIT ON P.ID=PIT.person_id  \
            JOIN `image_tiles` IT ON PIT.image_id=IT.id',
                            function(err, rows, fields) {
                                var result = groupResultByID(rows, ["url", "source", "caption", "width", "height"]);
                                callback(err, result);
                            });
                    },
                    function(callback) {
                        connection.query('SELECT P.id, IT.button_text, IT.long_text, IT.short_text FROM `person` P \
            JOIN `person_text_tile` PTT ON P.ID=PTT.person_id \
            JOIN `text_tiles` IT ON PTT.text_tile_id=IT.id',
                            function(err, rows, fields) {
                                var result = groupResultByID(rows, ["button_text", "long_text", "short_text"]);
                                callback(err, result);
                            });
                    },
                    function(callback) {
                        connection.query('SELECT P.id, T.letter, T.text FROM `person` P JOIN `person_tags` PT\
            ON P.id=PT.person_id JOIN `tags` T ON PT.tag_name=T.text',
                            function(err, rows, fields) {
                                var result = groupResultByID(rows, ["letter", "text"]);
                                callback(err, result);
                            });
                    },
                    function(callback) {
                        connection.query('SELECT P.id, IT.caption, IT.height, IT.width, IT.source,\
            IT.url FROM `person` P JOIN `image_tiles` IT ON P.portrait_id=IT.id',
                            function(err, rows, fields) {
                                var result = groupResultByID(rows, ["url", "caption", "source", "width", "height"]);
                                callback(err, result);
                            });
                    }
                ],
                function(err, results) {
                    var tileTypes = ["imageTiles", "dataTiles", "chips", "portrait"]

                    // Loop Person Resultset
                    for (var person in rows) {
                        // Loop parallel executed queries
                        for (var query_idx in results) {
                            // Map parallel query results into corresponding person
                            rows[person][tileTypes[query_idx]] = results[query_idx][rows[person].id];
                        }
                    }
                    next(null, rows);
                });

        }
    ], function(err, result) {
        callback(result);
    });
}

// GET /person
function personGetAll(req, res) {
    var result = [];

    selectAllQuery(function(result) {
        res.json({
            persons: result
        });
    });

}

// DELETE /person/{id}
function personDeleteSpecific(req, res) {
  var id = req.swagger.params.id.value;
  connection.query('DELETE FROM person WHERE id = ?', [id], function (err, results){
    if (err) { res.status(500).end({message: err}); } else {
      res.end({status: "OK"});
    }
  });
}

// GET /person/{id}
function personGetSpecific(req, res) {
    var id = req.swagger.params.id.value;
    selectAllQuery(function(result) {
        async.filter(result, function(res, callback) {
            callback(null, res.id === id);
        }, function(err, filtered) {
            res.json(filtered[0]);
        });
    });
}

// PUT /person/new
function personAdd(req, res) {
    async.waterfall([
        function(next) {
            var p = req.body.portrait[0];
            connection.query('INSERT INTO image_tiles SET ?', {
                caption: p.caption,
                url: p.url,
                source: p.source,
                height: p.height,
                width: p.width
            }, function(err, results) {
                if (err) {
                    res.status(500).send({
                        message: err
                    });
                    throw err;
                };
                next(null, req.body, results.insertId);
            });
        },
        function(body, portraitID, next) {
            var bulkArray = [];
            for (var person of req.body.imageTiles) {
                bulkArray.push([person.url, person.caption,
                    person.source, person.width, person.height
                ]);
            }
            console.log(bulkArray);
            connection.query('INSERT INTO image_tiles (url, caption, source, width, height) \
              VALUES ?', [bulkArray], function(err, results) {
                if (err) {
                    res.status(500).send({
                        message: err
                    });
                    throw err;
                };
                next(null, body, portraitID, [results.insertId, results.affectedRows]);
            });
        },
        function(body, portraitID, images, next) {
            var bulkArray = [];
            for (var tile of req.body.dataTiles) {
                bulkArray.push([tile.button_text, tile.long_text, tile.short_text]);
            }
            connection.query('INSERT INTO text_tiles (button_text, long_text, short_text) \
              VALUES ?', [bulkArray], function(err, results) {
                if (err) {
                    res.status(500).send({
                        message: err
                    });
                    throw err;
                };
                console.log(results);
                next(null, body, portraitID, images, [results.insertId, results.affectedRows]);
            });
        },
        function(body, portraitID, images, data, next) {
            var bulkArray = [];
            for (var chip of req.body.chips) {
                bulkArray.push([chip.letter, chip.text]);
            }
            connection.query('REPLACE INTO tags (letter, text) VALUES ?', [bulkArray], function(err, results) {
                if (err) {
                    console.log("Ignoring tag insertion Error (probably duplicate)");
                    next(null, body, portraitID, images, data, null);
                } else {
                    next(null, body, portraitID, images, data, [results.insertId, results.affectedRows]);
                }

            });
        },
        function(body, portraitID, images, data, tags, next) {
            var query = connection.query('INSERT INTO person (firstname, lastname, caption, portrait_id) VALUES (?)',
            [[ body.firstname, body.lastname, body.caption, portraitID  ]], function(err, results) {
                if (err) {
                    console.error(err);
                } else {
                    next(null, body, portraitID, images, data, tags, [results.insertId, results.affectedRows]);
                }
            });
        }
    ], function(error, body, portraitID, images, data, tags, person) {
        var connSQLs = [];

        for (var i = images[0]; i < images[0] + images[1]; i++){
          connSQLs.push("INSERT INTO person_image_tile (image_id, person_id) VALUES (" + i + "," + person[0] + ")");
        }
        for (var i = data[0]; i < data[0] + data[1]; i++){
          connSQLs.push("INSERT INTO person_text_tile (text_tile_id, person_id) VALUES (" + i + "," + person[0] + ")");
        }
        for (var tag of body.chips){
          connSQLs.push("INSERT INTO person_tags (tag_name, person_id) VALUES (\"" + tag.text + "\"," + person[0] + ")");
        }
        console.log(connSQLs);
          for ( var query of connSQLs ) {
            connection.query(query, function(err,results){
              if (err) console.error(err);
            });
          }

        res.json(person);
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
