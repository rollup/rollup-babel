var sander = require( 'sander' );
var rollup = require( 'rollup' );
var babel = require( 'babel-core' );

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
	babelOptions.sourceMap = !!options.sourceMap;

	var usedHelpers = [];

	var transformers = Array.isArray( options.transform ) ?
		options.transform :
		options.transform ? [ options.transform ] : [];

	function rollupBabelTransformer ( code, id ) {
		var options = extend({ filename: id }, babelOptions );

		var transformed = babel.transform( code, options );

		transformed.metadata.usedHelpers.forEach( function ( helper ) {
			if ( !~usedHelpers.indexOf( helper ) ) usedHelpers.push( helper );
		});

		return {
			code: transformed.code,
			map: transformed.map
		};
	}

	transformers.push( rollupBabelTransformer );
	options.transform = transformers;

	// TODO need to create some hooks so we don't need to reimplement all this...
	return rollup.rollup( options )
		.then( function ( bundle ) {
			var helpers = babel.buildExternalHelpers( usedHelpers, 'var' )
				.replace( /var babelHelpers = .+/, '' )
				.replace( /babelHelpers\.(\w+) = /g, 'var babelHelpers_$1 = ' )
				.trim();

			function generate ( options ) {
				options = extend( options, {
					intro: options.intro ? helpers + '\n\n' + options.intro : helpers + '\n'
				});

				var generated = bundle.generate( options );
				generated.code = generated.code.replace( /babelHelpers\./g, 'babelHelpers_' );
				return generated;
			}

			return {
				generate: generate,
				write: function ( options ) {
					if ( !options || !options.dest ) {
						throw new Error( 'You must supply options.dest to bundle.write' );
					}

					var dest = options.dest;
					var generated = generate( options );

					var code = generated.code;

					if ( options.sourceMap ) {
						if ( options.sourceMap === 'inline' ) {
							code += '\n//# sourceMappingURL=' + generated.map.toUrl();
						}

						else {
							return Promise.all([
								sander.writeFile( dest, code ),
								sander.writeFile( dest + '.map', generated.map.toString() )
							]);
						}
					}

					return sander.writeFile( dest, code );
				}
			};
		});
}

module.exports = {
	rollup: rollupBabel
};
