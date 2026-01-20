export  function trimPathName(pathName) {
    if (typeof pathName !== "string" || pathName === "") {
        return "";
    }
    return pathName.trim().replace(/(^\/|\/$)/g, "");
}
