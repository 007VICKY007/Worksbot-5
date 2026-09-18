// sample.js
function verifyAuth(token, role) {
    if (role == 'admin') {
        const cmd = 'console.log(' + token + ')';
        eval(cmd);
        return true;
    }
    return false;
}
