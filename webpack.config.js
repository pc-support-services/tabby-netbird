const path = require('path')

module.exports = {
    mode: 'production',
    entry: './src/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        libraryTarget: 'umd',
        globalObject: 'this',
    },
    externals: [
        'tabby-core',
        'tabby-settings',
        '@angular/core',
        '@angular/common',
        '@angular/forms',
        '@ng-bootstrap/ng-bootstrap',
    ],
}