export  function trimPathName(pathName) {
    return pathName.trim().replace(/(^\/|\/$)/g, "");
}
