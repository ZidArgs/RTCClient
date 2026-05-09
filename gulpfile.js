import path from "path";
import gulp from "gulp";
import changed, {compareContents} from "gulp-changed";
import ImportAnalyzer from "@zidargs/buildtools/ImportAnalyzer.js";
import {packScript} from "@zidargs/buildtools/PackScript.js";
import SourceImport from "@zidargs/buildtools/SourceImport.js";

const __dirname = path.resolve();

const IN_PATH = path.resolve(__dirname, "src");
const OUT_PATH = path.resolve(__dirname, "lib");

const REBUILD = process.argv.indexOf("-rebuild") >= 0;

console.log({REBUILD});

function copyJS() {
    const FILES = [
        `${IN_PATH}/**/*.js`
    ];
    let res = gulp.src(FILES);
    res = res.pipe(ImportAnalyzer.register(IN_PATH, OUT_PATH, __dirname));
    res = res.pipe(SourceImport.compiler());
    if (!REBUILD) {
        res = res.pipe(changed(OUT_PATH, {hasChanged: compareContents}));
    }
    res = res.pipe(gulp.dest(OUT_PATH));
    return res;
}

function buildWorker() {
    const FILES = [
        `${IN_PATH}/**/*.w.js`
    ];
    let res = gulp.src(FILES);
    res = res.pipe(ImportAnalyzer.register(IN_PATH, OUT_PATH, __dirname));
    res = res.pipe(packScript());
    if (!REBUILD) {
        res = res.pipe(changed(OUT_PATH, {hasChanged: compareContents}));
    }
    res = res.pipe(gulp.dest(OUT_PATH));
    return res;
}

function finish(done) {
    ImportAnalyzer.printUnresolvedImports();
    ImportAnalyzer.writeImportFile();
    done();
}

export const build = gulp.series(gulp.parallel(copyJS, buildWorker), finish);

export const watch = function() {
    // JS
    gulp.watch([
        `src/**/*.js`
    ], copyJS);
};
