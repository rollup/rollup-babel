var fs = require( 'fs' );
var path = require( 'path' );
var sander = require( 'sander' );
var rollup = require( 'rollup' );
var babel = require( 'babel-core' );

var PLACEHOLDER = '"#BABEL_HELPERS_PLACEHOLDER#"';
var absolutePath = /^(?:\/|(?:[A-Za-z]:)?\\)/;

function extend ( target, source ) {
	Object.keys( source ).forEach( function ( key ) {
		target[ key ] = source[ key ];
	});
	return target;
}

function rollupBabel ( options ) {
	var babelOptions = options.babel || {};
	var index;

	// ensure es6.modules are blacklisted
	if ( babelOptions.whitelist ) {
		index = babelOptions.whitelist.indexOf( 'es6.modules' );
		if ( ~index ) babelOptions.whitelist.splice( index, 1 );
	}

	if ( !babelOptions.blacklist ) babelOptions.blacklist = [];
	index = babelOptions.blacklist.indexOf( 'es6.modules' );
	if ( !~index ) babelOptions.blacklist.push( 'es6.modules' );

	babelOptions.externalHelpers = true;

	var usedHelpers = [];

	options.resolveId = function ( id, importer, options ) {
		// recreate default resolver, but treat babel-helpers as special case
		// TODO would be nice if this was easier to compose...
		if ( id === 'babel-helpers' ) return 'babel-helpers';

		// absolute paths are left untouched
		if ( absolutePath.test( id ) ) return id;

		// if this is the entry point, resolve against cwd
		if ( importer === undefined ) return path.resolve( id );

		// we try to resolve external modules
		if ( id[0] !== '.' ) {
			// unless we want to keep it external, that is
			if ( ~options.external.indexOf( id ) ) return null;

			return options.resolveExternal( id, importer, options );
		}

		return path.resolve( path.dirname( importer ), id ).replace( /\.js$/, '' ) + '.js';
	};

	var load = options.load;

	options.load = function ( id ) {
		if ( /babel-helpers/.test( id ) ) return 'export default ' + PLACEHOLDER;
		var code = 'import babelHelpers from "babel-helpers";\n' +
			( load ? load( id ) : fs.readFileSync( id, 'utf-8' ) );

		var options = extend({ filename: id }, babelOptions );

		var transformed = babel.transform( code, options );
		transformed.metadata.usedHelpers.forEach( function ( helper ) {
			if ( !~usedHelpers.indexOf( helper ) ) {
				usedHelpers.push( helper );
			}
		});

		return transformed.code;
	};

	// TODO need to create some hooks so we don't need to reimplement all this...
	return rollup.rollup( options )
		.then( function ( bundle ) {
			var helpers = babel.buildExternalHelpers( usedHelpers, 'var' );

			function clean ( code ) {
				return code.replace( PLACEHOLDER, helpers )
					.replace( /\s*var babelHelpers.+/g, '' )
					.replace( /babelHelpers\.(\w+) = /g, 'var $1 = ' )
					.replace( /babelHelpers\./g, '' );
			}

			return {
				generate: function ( options ) {
					if ( options.sourceMap ) {
						throw new Error( 'rollup-babel does not currently support sourcemaps' );
					}

					var generated = bundle.generate( options );
					generated.code = clean( generated.code );
					return generated;
				},
				write: function ( options ) {
					if ( !options || !options.dest ) {
						throw new Error( 'You must supply options.dest to bundle.write' );
					}

					if ( options.sourceMap ) {
						throw new Error( 'rollup-babel does not currently support sourcemaps' );
					}

					var dest = options.dest;
					var generated = bundle.generate( options );

					var code = clean( generated.code );

					return sander.writeFile( dest, code );
				}
			}
		});
}

module.exports = {
	rollup: rollupBabel
};
