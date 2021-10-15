//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    ejs = require( 'ejs' ),
    fs = require( 'fs' ),
    multer = require( 'multer' ),
    app = express();

var my_s2t = require( './my_s2t' );
var my_discovery = require( './my_discovery' );

var settings = require( './settings' );

app.use( multer( { dest: './tmp/' } ).single( 'voice' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//.  HTTP server
var http = require( 'http' ).createServer( app );
var io = require( 'socket.io' )( http );

//. S2T
var s2t_params = {
  objectMode: true,
  contentType: 'audio/mp3',
  model: settings.s2t_model,
  //keywords: [],
  //keywordsThreshold: 0.5,
  interimResults: true,
  timestamps: true,
  maxAlternatives: 3
};
//var s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );

//. Page for client
app.get( '/', function( req, res ){
  res.render( 'index', {} );
});

app.get( '/files', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var files = [];
  var _files = fs.readdirSync( './public' );
  for( var i = 0; i < _files.length; i ++ ){
    if( _files[i].endsWith( '.mp3' ) ){
      files.push( _files[i] );
    }
  }

  res.write( JSON.stringify( { status: true, files: files }, 2, null ) );
  res.end();
});

app.post( '/voice', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var voice = req.body.voice;
  var uuid = req.body.uuid;
  var voicefile = './public/' + voice;

  processAudioFile( voicefile, uuid ).then( function( result ){
    res.write( JSON.stringify( { status: true }, 2, null ) );
    res.end();
  }).catch( function( err ){
    console.log( err );
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
    res.end();
  })
});

app.post( '/audio', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var voicefile = req.file.path;
  var filename = req.file.originalname;
  var uuid = req.body.uuid;

  //. public フォルダへリネーム＆移動してから処理する
  fs.rename( voicefile, './public/' + filename, function( err ){
    if( err ){
      console.log( err );
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
      res.end();
    }else{
      processAudioFile( './public/' + filename, uuid ).then( function( result ){
        res.write( JSON.stringify( { status: true }, 2, null ) );
        res.end();
      }).catch( function( err ){
        console.log( err );
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
        res.end();
      })
    }
  });
});

app.post( '/setcookie', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var value = req.body.value;
  //console.log( 'value = ' + value );
  res.setHeader( 'Set-Cookie', value );

  res.write( JSON.stringify( { status: true }, 2, null ) );
  res.end();
});

async function processAudioFile( filepath, uuid, deleteFileWhenFinished ){
  return new Promise( async function( resolve, reject ){
    var s2t_stream = my_s2t.s2t.recognizeUsingWebSocket( s2t_params );
    fs.createReadStream( filepath ).pipe( s2t_stream );
    s2t_stream.on( 'data', function( evt ){
      //console.log( evt );
      /*
      evt = {
        result_index: 1,
        results: [
          {
            final: false,
            alternatives: [
              {
                transcript: "xxx xxxx xx xxxxxx ...",
                timestamps: [
                  [ "xxx", 15.55, 16.04 ],
                  [ "xxxx", 16.25, 16.6 ],
                  [ "xx", 16.6, 16.71 ],
                  [ "xxxxxx", 16.71, 17.21 ],
                    :
                ]
              }
            ]
          }
        ]
      }
      */
      sockets[uuid].emit( 'event_client_view', evt ); 
      if( evt.results[0].final ){
        var idx = evt.result_index;
        var text = evt.results[0].alternatives[0].transcript;
        text = text.split( ' ' ).join( '' );
        console.log( 'text = ' + text );

        //. Watson Discovery に問い合わせ
        /*
        var query_param = {
          environmentId: settings.discovery_environment_id,
          collectionId: settings.discovery_collection_id,
          naturalLanguageQuery: text
        };
        my_discovery.discovery.queryNotices( query_param ).then( function( response ){
          //console.log( {response} );
          if( response.status == 200 && response.result ){
            var result = response.result;
            console.log( 'matching_results = ' + result.matching_results );
            for( var i = 0; i < result.results.length; i ++ ){
              console.log( result.results[i] );
            }
          }
        }).catch( function( err ){
          console.log( {err} );
        });
        */
        var params = {
          projectId: settings.discovery_project_id,
          collectionIds: [ settings.discovery_collection_id ],
          naturalLanguageQuery: 'text:' + text
        };
        //console.log( { params } );
        my_discovery.discovery.query( params ).then( function( response ){
          //console.log( response.result );
          var results = [];
          if( response.result.results && response.result.results.length ){
            for( var i = 0; i < response.result.results.length; i ++ ){
              var result = response.result.results[i]
              if( result.document_id && result.result_metadata && result.document_passages && result.document_passages.length ){
                var document_id = result.document_id;
                var confidence = result.result_metadata.confidence;
                var passage_text = result.document_passages[0].passage_text;
                var wd_result = {
                  index: i,
                  document_id: document_id,
                  confidence: confidence,
                  passage_text: passage_text
                };
                //console.log( wd_result );
                results.push( wd_result );
              }
            }
          }

          sockets[uuid].emit( 'event_client_wd', { result_index: idx, results, results } ); 
        });
      }
    });
    s2t_stream.on( 'error', function( evt ){
      console.log( { evt } ); //. WebSocket connection error: WebSocket connection error
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      reject( evt );
    });
    s2t_stream.on( 'close', function( evt ){
      if( deleteFileWhenFinished ){
        fs.unlinkSync( filepath );
      }
      resolve( true );
    });
  });
}


//. socket.io
var sockets = {};
io.sockets.on( 'connection', function( socket ){
  console.log( 'connected.' );

  //. 初期化時（ロード後の最初の resized 時）
  socket.on( 'init_client', function( msg ){
    //console.log( 'init_client', msg );

    //. これでは初期化時以外でも目的のクライアントに返せるよう connection 時の socket を記憶しておく
    if( !sockets[msg.uuid] ){
      sockets[msg.uuid] = socket;
    }

    //. init_client を実行したクライアントにだけ init_client_view を返す
    sockets[msg.uuid].emit( 'init_client_view', msg ); 
  });
});


var port = process.env.PORT || 8080;
http.listen( port );
console.log( "server starting on " + port + " ..." );
