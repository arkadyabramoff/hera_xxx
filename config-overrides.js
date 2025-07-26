const { override, addWebpackPlugin } = require('customize-cra');
const webpack = require('webpack');

module.exports = override(
  // Add webpack IgnorePlugin to ignore problematic CSS parsing
  addWebpackPlugin(
    new webpack.IgnorePlugin({
      resourceRegExp: /postcss-url-parser/,
      contextRegExp: /css-loader/
    })
  ),
  
  // Add another IgnorePlugin to ignore the critical dependency warnings
  addWebpackPlugin(
    new webpack.IgnorePlugin({
      resourceRegExp: /critical dependency/,
      contextRegExp: /require function/
    })
  ),
  
  // Override webpack config to handle CSS issues
  (config) => {
    // Modify CSS loader to be more permissive
    const cssRule = config.module.rules.find(rule => rule.test && rule.test.toString().includes('css'));
    if (cssRule) {
      cssRule.use.forEach(loader => {
        if (loader.loader && loader.loader.includes('css-loader')) {
          loader.options = {
            ...loader.options,
            url: false, // Disable URL processing
            import: false, // Disable import processing
          };
        }
      });
    }
    
    return config;
  }
); 