// Jest runs the API sources as CommonJS, but @nestjs/cache-manager v12 is
// published as ESM-only, so requiring it from a CJS test runtime fails. This
// shim mirrors the parts of the public API the API sources use, including the
// real CACHE_MANAGER token value.
//
// It deliberately does not provide CacheModule: integration specs build narrow
// testing modules and stub the collaborators themselves. Importing AppModule
// under Jest would need an explicit CacheModule stub in the spec.
const CACHE_MANAGER = 'CACHE_MANAGER';
const CACHE_KEY_METADATA = 'cache_module:cache_key';
const CACHE_TTL_METADATA = 'cache_module:cache_ttl';

class CacheInterceptor {
  intercept(_context, next) {
    return next.handle();
  }
}

module.exports = {
  CACHE_MANAGER,
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
  CacheInterceptor,
};
