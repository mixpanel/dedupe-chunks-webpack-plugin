/* eslint-env node */
// @ts-check

const path = require(`path`);
const NormalModule = require(`webpack/lib/NormalModule`);

/**
 * A simple webpack plugin that takes modules that match moduleRegex and de-depe them in the target chunk.
 * This allows all modules of common code to stay in common bundle bundle and the entries that depend on the
 * bundle to not have duplicated modules. This greatly reduces the total amount of JS the browser needs to handle as we
 * only ship one copy of a module. This speeds up compilation too, since there is less minifying and source mapping.
 */
class DedupeChunksWebpackPlugin {
  constructor({fromChunks, toChunks}) {
    /** @type {Set<string>} */
    this.fromChunks = new Set(fromChunks);
    /** @type{Array<{name: string, moduleRegex: RegExp}>} */
    this.toChunks = toChunks;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(`DedupeChunksWebpackPlugin`, (compilation) => {
      compilation.hooks.optimizeChunksAdvanced.tap(`DedupeChunksWebpackPlugin`, (chunks) => {
        // we don't care about named child compilations e.g mini-css-extract
        // we are only interested in the root compilation
        if (compilation.compiler.parentCompilation) {
          return;
        }

        this.transferModules(compiler, compilation, chunks);
      });
    });
  }

  transferModules(compiler, compilation, chunks) {
    const namedChunks = compilation.namedChunks;

    this.toChunks
      .filter((toChunk) => namedChunks.has(toChunk.name))
      .forEach((toChunk) => {
        const dstChunk = namedChunks.get(toChunk.name);

        chunks
          .filter((chunk) => this.fromChunks.has(chunk.name) && chunk.name !== toChunk.name)
          .forEach((srcChunk) => {
            const movedModules = Array.from(srcChunk.modulesIterable)
              .filter((module) => this.shouldMoveModule(module, toChunk.moduleRegex, compiler.context))
              .map((module) => this.moveModule(module, srcChunk, dstChunk));

            // add dstChunk as a dependency of src chunk group if any modules got moved
            if (movedModules.length > 0) {
              this.addChunkGroupDependency(compilation.chunkGroups, srcChunk, dstChunk);
            }
          });
      });
  }

  shouldMoveModule(module, moduleRegex, compileContextDir) {
    // prettier-ignore
    return (
      module instanceof NormalModule &&
      moduleRegex.test(path.relative(compileContextDir, module.resource))
    );
  }

  moveModule(module, srcChunk, dstChunk) {
    srcChunk.moveModule(module, dstChunk);
    return module;
  }

  addChunkGroupDependency(chunkGroups, srcChunk, dstChunk) {
    const chunkGroup = chunkGroups.find((cg) => cg.options.name === srcChunk.name);
    chunkGroup.pushChunk(dstChunk);
    dstChunk.addGroup(chunkGroup);
  }
}

module.exports = DedupeChunksWebpackPlugin;
