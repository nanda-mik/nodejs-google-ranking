
/*
== HTML structure ==
  search results:
    - body > #main #cnt .mw #rcnt #center_col #search ol li
    - [simpler] #search ol li
  
    inside each li:
      > div.vsc > h3 > a                = link, take .text() for title, don't take the href
      > div.vsc > div.s > .f > cite     = visible url, take .text()
      > div.vsc > div.s > .st           = description
  
  pager:
    - body > #main #cnt #foot #xjs #navcnt #nav [td.navend] > a | a#pnnext    (differs in js/js-less modes)
    - [simpler] #nav a#pnnext
*/

var jscrape = require('jscrape'),   // lazy combo of jquery+jsdom+request
    async = require('async');

var gBase = 'http://www.google.com';    // maybe expand to other languages?



// returns the search URL for a query and page
var searchUrl = function searchUrl(searchPhrase) {
  // spaces=>+, otherwise escape
  searchPhrase = escape( searchPhrase.replace(/ /g, '+') );
  var url = gBase + '/search?hl=en&output=search&q=' + searchPhrase + '&';
  // [no longer using pages this way, see below]
  // if (!isNaN(pageNum) && pageNum > 1) url += 'start=' + (10*pageNum) + '&';
  return url;
};
module.exports.searchUrl = searchUrl;




// given a search URL (for a single results page), request and parse results
var getGoogleResultsPage = function getGoogleResultsPage(url, callback) {
  // (default 'Windows NT 6.0' probably looks fishy coming from a Linux server)
  jscrape.headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_4) AppleWebKit/536.5 (KHTML, like Gecko) Chrome/19.0.1084.52 Safari/536.5';
  
  // console.log('getting', url);
  
  jscrape(url, function (error, $, response, body) {
    if (error) return next(error);
    if (!$) return next(new Error("Missing jQuery object"));

    // (highly unlikely)
    if (response.statusCode !== 200) return next(new Error("Bad status code " + response.statusCode));

    var res = {
      nextPageUrl: null,
      results: []
    };

    // parse results
    $('#search ol li.g').each(function(){
      var $rc = $(this).find('div.rc');
      res.results.push({
        title: $rc.find('> h3 a').text(),
        url: $rc.find('> div.s .f cite').text(),
        description: $rc.find('> div.s .st').text(),
        // page: pageNum,
        ranking: res.results.length + 1
      });
    });
    
    // parse the Next link
    var nextPageUrl = $('#nav a#pnnext').attr('href');
    if (typeof nextPageUrl == 'undefined' || nextPageUrl === null || nextPageUrl === '') {
      res.nextPageUrl = null;
    }
    // should be a relative url
    else if (/^http/.test(nextPageUrl)) {
      return callback(new Error("Next-page link is not in expected format"));
    }
    else {
      res.nextPageUrl = gBase + nextPageUrl;
    }

    callback(null, res);
  });
};



// find where in the top 100 results a match is found.
// (only gets as many as needed, doesn't get 100 if found earlier)
// urlChecker:
//  - can be a string, then visible URL is indexOf'd w/ the string.
//  - can be a function, gets a result array (w/url, title, description), should return true on match.
// callback gets [error, result] where result contains page & ranking, or false if not found.
var getGoogleRanking = function getGoogleRanking(searchPhrase, urlChecker, callback) {
  if (typeof urlChecker === 'string') {
    urlChecker = defaultUrlChecker(urlChecker);
  }
  else if (typeof urlChecker !== 'function')
    throw new Error('urlChecker needs to be a string or a function');
    
  var pageNum = 1,
    url = searchUrl(searchPhrase),    // initial
    found = false;

  // get 10 pages of results. get the next-page url from the results of each.
  // (could just use start=N param, but seems more authentic to follow actual results link.
  //  also maybe less likely to raise red flags)
  async.whilst(
    function test() { return pageNum <= 10 && url != null && !found; },

    function getNextPage(next) {
      // console.log(pageNum, url);

      getGoogleResultsPage(url, function(error, pageResults){
        // console.dir(pageResults);

        if (error) return next(error);

        // pageResults have 'nextPageUrl' (string) and results (array)
        url = pageResults.nextPageUrl || null;
        
        for (var i=0; i<pageResults.results.length; i++) {
          if (urlChecker(pageResults.results[i]) === true) {
            found = pageResults.results[i];
            found.page = pageNum;
            // console.log('Found!', found);
            return next();  // will stop b/c found is not falsy
          }
        }
        
        pageNum++;
        next();
      });
    },
    function done(error) {
      if (error) return callback(error);
      callback(null, found);
    }
  );
};
module.exports.getGoogleRanking = getGoogleRanking;



// get 100 top results for a query
// searchPhrase: string to search for
// callback gets error or array of results
var getGoogleResults = function getGoogleResults(searchPhrase, callback) {
  
  var pageNum = 1,
    url = searchUrl(searchPhrase),
    results = [];

  // get 10 pages of results. get the next-page url from the results of each.
  // (could just use start=N param, but seems more authentic to follow actual results link.
  //  also maybe less likely to raise red flags)
  async.whilst(
    function test() { return pageNum <= 10 && url != null; },

    function getNextPage(next) {
      // console.log(pageNum, url, results.length);
      
      getGoogleResultsPage(url, function(error, pageResults){
        // console.dir(pageResults);
        
        if (error) return next(error);
        
        // pageResults have 'nextPageUrl' (string) and results (array)
        url = pageResults.nextPageUrl || null;
        results = results.concat(pageResults.results);
        
        pageNum++;
        next();
      });
    },
    function done(error) {
      if (error) return callback(error);
      callback(null, results);
    }
  );
};
module.exports.getGoogleResults = getGoogleResults;



// default urlChecker for a string match. returns a function.
var defaultUrlChecker = function(url) {
  // Remove protocol prefix
  url = url.replace(/^https?:\/\//, '');

  return function(result) {
    if (typeof result.url !== 'undefined')
      if (result.url.indexOf(url) !== -1)
        return true;
  };
};
