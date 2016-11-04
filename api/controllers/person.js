'use strict';
var util = require('util');
var mysql = require('mysql');
var async = require('async');
var fs = require('fs');

module.exports = {
    personGetAll: personGetAll,
    personGetSpecific: personGetSpecific,
    personAddNew: personAdd,
    personUpdateSpecific: personUpdateSpecific,
    personDeleteSpecific: personDeleteSpecific,
    purge: purge
};

var config = JSON.parse(fs.readFileSync('./config/db.json', 'utf-8'));
var connection = mysql.createConnection(config);

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
        if (err) throw err;
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

// PATCH /person/{id}
function personUpdateSpecific(req, res) {
    var id = req.swagger.params.id.value;
    var deducedQueries = [],
        deducedRequests = [],
        tasks = [];
    for (var entry in req.body) {
        switch (entry) {
            case "firstname":
            case "lastname":
            case "caption":
                deducedQueries.push(
                    mysql.format("UPDATE person SET ??=? WHERE id = ?", [entry, req.body[entry], id]));
                break;
            case "imageTiles":
                tasks.push(function(callback) {
                    insertImages.bind(req)(function(err, result) {
                        if (err) return callback(err);
                        deducedQueries.push(mysql.format("DELETE FROM person_image_tile\
                WHERE person_id = ?", [id]));
                        for (var i = result[0]; i < result[0] + result[1]; i++) {
                            deducedQueries.push(mysql.format("INSERT INTO person_image_tile\
                (image_id, person_id) VALUES (?,?)", [i, id]));
                        }
                        callback(err);
                    });
                });
                break;
            case "dataTiles":
                tasks.push(function(callback) {
                    insertData.bind(req)(function(err, result) {
                        if (err) return callback(err);
                        deducedQueries.push(mysql.format("DELETE FROM person_text_tile\
                WHERE person_id = ?", [id]));
                        for (var i = result[0]; i < result[0] + result[1]; i++) {

                            deducedQueries.push(mysql.format("INSERT INTO person_text_tile\
                (text_tile_id, person_id) VALUES (?,?)", [i, id]));
                        }
                        callback(err);
                    });
                });
                break;
            case "portrait":
                tasks.push(function(callback) {
                    insertPortrait.bind(req)(function(err, result) {
                        deducedQueries.push(mysql.format("UPDATE \
                  person SET portrait_id = ? WHERE id = ?", [result, id]));
                        callback(err);
                    });
                });
                break;
            case "chips":
                tasks.push(function(callback) {
                    insertTags.bind(req)(function(err, result) {
                        deducedQueries.push(mysql.format("DELETE FROM person_tags\
                WHERE person_id = ?", [id]));
                        for (var chip of req.body.chips) {
                            deducedQueries.push(mysql.format("INSERT INTO person_tags\
                (tag_name, person_id) VALUES (?,?)", [chip.text, id]));
                        }
                        callback(err);
                    });
                });
                break;
        }
    }
    async.parallel(tasks, function(_derr, _dres) {
        if (_derr) return res.status(500).json({ message: _derr });
        for (var query in deducedQueries) {
            (function(query) {
                deducedRequests.push(function(callback) {
                    connection.query(query, callback);
                });
            })(deducedQueries[query]);
        }
        // In series because delete from --> insert.... TODO maybe optimize
        async.series(deducedRequests, function(err, results) {
            if (err) {
                res.status(500).json({ message: err });
            } else {
                res.json("OK");
            }
        })
    })


}

// DELETE /person/{id}
function personDeleteSpecific(req, res) {
    var id = req.swagger.params.id.value;
    connection.query('DELETE FROM person WHERE id = ?', [id], function(err, results) {
        if (err) {
            res.status(500).end({
                message: err
            });
        } else {
            res.json({
                status: "OK"
            });
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
function insertPortrait(callback) {
    if (this.body.hasOwnProperty("portrait") && this.body.portrait.length < 1) {
        return callback("portrait required!");
    }

    var p = this.body.portrait[0];
    connection.query('INSERT INTO image_tiles SET ?', {
        caption: p.caption,
        url: p.url,
        source: p.source,
        height: p.height,
        width: p.width
    }, function(err, results) {
        callback(err, results.insertId);
    });
}

function insertImages(callback) {
    if (this.body.hasOwnProperty("imageTiles") && this.body.imageTiles.length < 1) {
        return callback("image tiles required!");
    }
    var bulkArray = [];
    for (var person of this.body.imageTiles) {
        bulkArray.push([person.url, person.caption,
            person.source, person.width, person.height
        ]);
    }
    connection.query('INSERT INTO image_tiles (url, caption, source, width, height) \
              VALUES ?', [bulkArray], function(err, results) {
        if (err) return callback(err);
        callback(err, [results.insertId, results.affectedRows]);
    });
}

function insertData(callback) {
    if (this.body.hasOwnProperty("dataTiles") && this.body.dataTiles.length < 1) {
        // DataTiles are not required
        return callback(null, [null, null]);
    }

    var bulkArray = [];
    for (var tile of this.body.dataTiles) {
        bulkArray.push([tile.button_text, tile.long_text, tile.short_text]);
    }
    connection.query('INSERT INTO text_tiles (button_text, long_text, short_text) \
              VALUES ?', [bulkArray], function(err, results) {
        if (err) return callback(err);
        callback(err, [results.insertId, results.affectedRows]);
    });
}

function insertTags(callback) {
    if (this.body.hasOwnProperty("chips") && this.body.chips.length < 1) {
        // Tags are not required
        return callback(null, [null, null]);
    }
    var bulkArray = [];
    for (var chip of this.body.chips) {
        bulkArray.push([chip.letter, chip.text]);
    }
    connection.query('REPLACE INTO tags (letter, text) VALUES ?', [bulkArray], function(err, results) {
        if (err) return callback(err);
        callback(err, [results.insertId, results.affectedRows]);
    });
}

function insertPerson(portraitID, next) {
    var query = connection.query('INSERT INTO person \
      (firstname, lastname, caption, portrait_id) VALUES (?)', [
        [this.body.firstname, this.body.lastname, this.body.caption, portraitID]
    ], function(err, results) {
        if (err) return next(err);
        next(null, [results.insertId, results.affectedRows]);

    });
}

function personAdd(req, res) {
    var tasks = [
        insertPortrait,
        insertImages,
        insertData,
        insertTags,
    ];
    for (var task in tasks) {
        tasks[task] = tasks[task].bind(req);
    }
    async.parallel(tasks, function(err, results) {
        if (err) {
            return res.status(500).json({ message: err });
        }
        async.waterfall([
            insertPerson.bind(req, results[0])
        ], function(err, person) {
            if (err) {
                res.status(500).json({ message: err });
            }
            // Link person table to satellite entities
            var connSQLs = [];
            for (var i = results[1][0]; i < results[1][0] + results[1][1]; i++) {
                connSQLs.push("INSERT INTO person_image_tile\
              (image_id, person_id) VALUES (" + i + "," + person[0] + ")");
            }
            for (var i = results[2][0]; i < results[2][0] + results[2][1]; i++) {
                connSQLs.push("INSERT INTO person_text_tile \
              (text_tile_id, person_id) VALUES (" + i + "," + person[0] + ")");
            }
            for (var tag of req.body.chips) {
                connSQLs.push("INSERT INTO person_tags\
              (tag_name, person_id) VALUES (\"" + tag.text + "\"," + person[0] + ")");
            }
            for (var query of connSQLs) {
                connection.query(query, function(err, results) {
                    if (err) console.error(err);
                });
            }
            res.json({ id: person[0] });
        });
    });
}
// GET /person/purgeAll
function purge(req, res) {
    var requests = [
            "DELETE FROM person", "DELETE from tags", "DELETE from image_tiles", "DELETE from data_tiles"
        ],
        tasks = [];
    for (var q of requests) {
        (function(query) {
          tasks.push(function(callback){
            connection.query(query, callback);
          });
        })(q);
    }
    async.parallel(tasks, function(err, response){
      if (err) { res.status(500).json({message : err}) }
      else { res.json("OK") }
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
