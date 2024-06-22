// Interval for creating a websocket connection
// to receive song data
//
var socketConnectionInterval   = null;
var socketConnectionIntervalMs = 5000;  // 5s
var connectionEstablished      = false; // Is a websocket connection established?
var socket                     = null;  // websocket
var socketAddress              = "ws://localhost:8764";

// Timeout for automatic rotation of album suggestions
//
var rotateSuggestionTimeout   = null;
var rotateSuggestionTimeoutMs = 15000; // 15 seconds

// Displayed suggestions, each suggestion is an object of the form:
// {
// 		"album"  : album name
//		"artist" : aritst name
//		"art"    : base64/path/url to album art
// }
//
var albumSuggestions = null;

// Timeout until dropdown menu with custom art
// control automatically hides
//
var actionMenuTimeout   = null;
var actionMenuTimeoutMs = 5000; // 5s
var useCustomArt        = true; // Default custom art state

// Timeout for the amount of time without receiving
// any song data until switching from now playing
// back to the suggestions
//
var returnToSuggestionsTimeout   = null;
var returnToSuggestionsTimeoutMs = 5*60*1000; // 5 minutes

// Timeout for how long to wait before expanding the album art
// after song, artist, or album change if it was already expanded
// before the song/artist/album changed
//
var reexpandTimeout   = null;

// Timeouts for handling resetting the scroll position
// of the track, artist, and album text displays
//
var trackScrollTimeout     = null;
var artistScrollTimeout    = null;
var albumScrollTimeout     = null;
var infoScrollTimeoutMs    = 2500; // 2.5s

// Timeout for handling when to get new suggestions
// after being idle on the now playing screen for
// some amount of time.
//
var getNewSuggestionsTimeout   = null;
var getNewSuggestionsTimeoutMs = 60*60*1000; // 1 hr

// Seconds before the scrolling text transition starts
//
var infoScrollDelaySeconds = 3;

// Base text scroll duration in seconds before applying
// the growth factor.
//
var baseScrollDurationSeconds = 3.8;

// Duration of track, artist, album opacity transtions. Full
// length for fade out and fade in effect is 2x this duration.
//
var opacityTextSuggestionsDurationSeconds = 0.35; // .5x the .7s suggestion transition, see .suggestion in style.css
var opacityTextNowPlayingDurationSeconds  = 0.85; // .5x the 1.7s album art opacity transition, see .playingArtwork and .art_image_hidden in style.css

// The length of the audio recordings made on the websocket
// server. Used to determine the maximum length of time
// that the text has to scroll on now playing screen.
// There's a little more time to display the text than
// the recording length when accounting for the time it
// takes to get a result from Shazam. With a recording
// length of 15s, it seems to generally take 1.5s to get
// a response from Shazam. Corresponds to recordingLengthSeconds
// in python that handles recording and identification.
//
var recordingDurationSeconds = 15;

// Can the swap from suggestions to now playing occur?
//
var ableToSwapToNowPlaying = false;

// Settings to tweak when to show the placeholder
// record.png image. Changing failedMatchThreshold
// determines how many consecutive failed matches
// need to be received before displaying the placeholder
// image when already on the now playing screen and
// not displaying. When set to 1, failed matches
// will automatically swap to placeholder image and text.
//
var failedMatches        = 0;
var failedMatchThreshold = 1;

// Test functions for use with test.py
//////////////////////////////////////////////////////////////////

// Get back data mimicking matched song data
//
function getMatchedTestData() {
	socket.send("");
}

// Get back data mimicking unmatched song data
//
function getUnmatchedTestData() {
	socket.send("no match");
}

// Get back data mimicking matched song data
// that uses the placeholder image for album art
//
function getMatchedPlaceholderTestData() {
	socket.send("record");
}
//////////////////////////////////////////////////////////////////

// Prompt server to save information on played song data.
// Called when swapping from now playing to suggestions
// due to not receiving song data from the server
// for returnToSuggestionsTimeoutMs amount of time.
//
function savePlayed() {
	socket.send("save played");
}

// Clear the getNewSuggestionsTimeout timeout.
//
function clearGetNewSuggestionTimeout() {
	clearTimeout(getNewSuggestionsTimeout);
	getNewSuggestionsTimeout = null;
}

// Clear the returnToSuggestionsTimeout timeout.
//
function clearReturnToSuggestionTimeout() {
	clearTimeout(returnToSuggestionsTimeout);
	returnToSuggestionsTimeout = null;
}

// Clear the reexpandTimeout timeout.
//
function clearReexpandTimeout() {
	clearTimeout(reexpandTimeout);
	reexpandTimeout = null;
}

// Clear the rotateSuggestionTimeout.
//
function clearRotateSuggestionTimeout() {
	clearTimeout(rotateSuggestionTimeout);
	rotateSuggestionTimeout = null;
}

// Set the returnToSuggestionsTimeout timeout.
//
function setReturnToSuggestionTimeout() {
	clearReturnToSuggestionTimeout();

	returnToSuggestionsTimeout = setTimeout(function() {
		
		// save played when returning to suggestions
		//
		savePlayed();
		
		swapToSuggestions();
	}, returnToSuggestionsTimeoutMs);
}

// Update the info text, specifically for the
// suggestions screen. The track info text is used
// for the album name and the album info text is unused.
//
function updateSuggestionText(artist, album) {
	updateInfoText(album, artist, "");
}

// Set page title to the currently playing song
//
function setTitle(track, artist) {
	var title = "Currently Playing: " + track;

	if (artist != "") {
		title += " - " + artist;
	}

	$("title").text(title);
}

// Update the dummy text elements and set the max
// right attribute on the displayed text elements.
//
function updateDummyTextAndMaxRightAttribute(track, artist, album) {
	var trackElement       = $(".track");
	var dummyTrackElement  = $(".dummyTrack");
	var artistElement      = $(".artist");
	var dummyArtistElement = $(".dummyArtist");
	var albumElement       = $(".album");
	var dummyAlbumElement  = $(".dummyAlbum");

	// Update dummy text
	//
	dummyTrackElement.text(track);
	dummyArtistElement.text(artist);
	dummyAlbumElement.text(album);
	
	// Set maxRight attribute. The dummy track, artist, and
	// artist elements do not have a set length while the displayed
	// track, artist, and album elements do. As a result, the text on
	// the displayed elements will flow outside the element and not be
	// visible if the text is too long. Get the difference in width
	// between the displayed and dummy elements and set it as the maxRight
	// attribute on the displayed elements. These values will be used for
	// how far the transitions need to scroll to the left to display the
	// entire text if there is overflow.
	//
	trackElement.attr( "maxRight", dummyTrackElement.width()  - trackElement.width());
	artistElement.attr("maxRight", dummyArtistElement.width() - artistElement.width());
	albumElement.attr( "maxRight", dummyAlbumElement.width()  - albumElement.width());
}

// Update the info text for the track, artist, and
// album. Additionally, set the maxRight attribute
// to use for the scrolling transition.
//
function updateInfoText(track, artist, album) {

	// Change dummy text to set up for text change
	//
	updateDummyTextAndMaxRightAttribute(track, artist, album);

	// Trigger display changes
	//
	triggerTextUpdate();
}

// Trigger the text changes for the track, artist, and album
// text elements if the dummy text does not match the displayed
// text. After changing the opacity to 0, the text change is
// triggered and the opacity is set back to 1 for a fade in
// fade out effect.
//
function triggerTextUpdate() {
	if ($(".track").text() != $(".dummyTrack").text()) {
		$(".trackFadeWrapper").css("opacity", 0);
	}
	if ($(".artist").text() != $(".dummyArtist").text()) {
		$(".artistFadeWrapper").css("opacity", 0);
	}
	if ($(".album").text() != $(".dummyAlbum").text()) {
		$(".albumFadeWrapper").css("opacity", 0);
	}
}

// Update the displayed track, artist, album, album art,
// and album art blur using the song data received from
// the server.
//
function updatePlayingScreen(playingInfo) {
	setReturnToSuggestionTimeout();

	var albumArtElements      = $(".album_art");        // both images
	var hiddenArtImageElement = $(".art_image_hidden"); // top image
	var artImageElement       = $(".art_image");        // bottom image
	var playingBlur1Element   = $("#playingBlur1");
	var playingBlur2Element   = $("#playingBlur2");

	var trackName             = playingInfo["song"];
	var artistName            = playingInfo["artist"];
	var albumName             = playingInfo["album"];
	var usingPlaceholderImage = playingInfo["usingPlaceholderImage"]
	var albumArt              = null;
	
	if (useCustomArt) {
		albumArt = playingInfo["customArt"];
	}
	
	if (albumArt == null) {
		albumArt = playingInfo["art"];
	}

	// Change dummy text to set up for text change
	//
	updateDummyTextAndMaxRightAttribute(trackName, artistName, albumName);
	
	// Note whether the current update had song data
	// or was a failed match.
	//
	albumArtElements.attr("matched", playingInfo["matched"]);
	
	// Update the album art
	//
	if(hiddenArtImageElement.hasClass("art_image_visible")) { // Top .album_art is visible
		
		// Only change the art if necessary
		//
		if (hiddenArtImageElement.attr("src") != albumArt) {

			// If the new art is the placeholder record image, apply the class
			// that has the rotation animation to the image we're about to show
			//
			if (usingPlaceholderImage) {
				artImageElement.addClass("placeholderImage");
			}

			// Set the album art and trigger the fade transition
			//
			artImageElement.attr("src", albumArt);
			hiddenArtImageElement.removeClass("art_image_visible");
		}
		else {
			//console.log("skip art update, art hasn't changed");
		}
	}
	else { // Bottom .album_art is visible
		if (artImageElement.attr("src") != albumArt) {

			// If the new art is the placeholder record image, apply the class
			// that has the rotation animation to the image we're about to show.
			// This is trickier than above because the bottom .album_art image is visible, we need to:
			// 1. Set the top .album_art image (currently hidden) to have the same art
			//    as the bottom .album_art image
			// 2. Turn off transitions and show the top .album_art image, then reenable transitions
			// 3. Set the bottom .album_art image to use the placeholder image and apply
			//    the rotation animation class
			// 4. Fade out the top .album_art image. The bottom .album_art image remains
			//    the visible one in the case where the placeholder art is used
			//
			if (usingPlaceholderImage) {

				// 1.
				//
				hiddenArtImageElement.attr("src", artImageElement.attr("src"));

				// 2.
				//
				hiddenArtImageElement.addClass("noTransition");
				hiddenArtImageElement.addClass("art_image_visible");
				hiddenArtImageElement.removeClass("noTransition");

				// 3.
				//
				artImageElement.attr("src", albumArt);
				artImageElement.addClass("placeholderImage");

				// 4.
				//
				hiddenArtImageElement.removeClass("art_image_visible");
			}
			else {

				// Set the image
				//
				hiddenArtImageElement.attr("src", albumArt);

				// Once the fade in transition finishes, remove the placeholder
				// image class from the bottom .album_art image to stop art rotation
				//
				hiddenArtImageElement.one("transitionend", function() {
					artImageElement.removeClass("placeholderImage");
				});

				// Trigger the fade transition
				//
				hiddenArtImageElement.addClass("art_image_visible");
			}
		}
		else {
			//console.log("skip art update, art hasn't changed");
		}
	}
	
	// Update the background blur if it's changed. Set the new
	// album blur, then trigger the fade transition.
	//
	if (playingBlur1Element.hasClass("hidden")) { // blur 2 is shown, blur 1 is hidden
		if (playingBlur2Element.css("background-image") != "url(\"" + albumArt + "\")") {
			playingBlur1Element.css("background-image", "url(" + albumArt + ")");
			playingBlur2Element.removeClass("shown");
			playingBlur1Element.removeClass("hidden");
		}
		else {
			//console.log("skip blur 2 update, art hasnt changed");
		}
	}
	else { // blur 1 is shown, blur 2 is hidden
		if (playingBlur1Element.css("background-image") != "url(\"" + albumArt + "\")") {
			playingBlur2Element.css("background-image", "url(" + albumArt + ")");
			playingBlur1Element.addClass("hidden");
			playingBlur2Element.addClass("shown");
		}
		else {
			//console.log("skip blur 1 update, art hasnt changed");
		}
	}

	// No change in any of the displayed text.
	//
	if ($(".track").text() == $(".dummyTrack").text() &&
		$(".artist").text() == $(".dummyArtist").text() &&
		$(".album").text() == $(".dummyAlbum").text()) {
		return;
	}

	// Update page title
	//
	setTitle(trackName, artistName);

	// If the art is currently expanded when there are text changes:
	//
	if (albumArtElements.hasClass("album_art_expanded")) {
		// 1. Disable clicking during the transition
		// 2. Trigger the shrinking transition
		// 3. After the transition completes, update the text,
		//    and set a timeout for reexpanding the art
		//

		// 1.
		//
		albumArtElements.addClass("noClick");

		// 3. This is set for only one .album_art element, otherwise this
		//    would occur twice
		//
		hiddenArtImageElement.one("transitionend", function() {
			updateTextAndSetReexpandTimeout();
					
			$(".album_art").removeClass("noClick");
		});
		
		// 2.
		//
		albumArtElements.removeClass("album_art_expanded");

		// Reveal text when shrinking
		//
		$("#displayedInfo").removeClass("hideForExpansion");
	}
	else if (reexpandTimeout != null) {

		// This shouldn't happen with the default recording length,
		// but is here to accomodate slighty quicker websocket message
		// times or changes to recording length. This will handle if the
		// art was previously shrunk for a track, artist, or album update,
		// and one of those text displays changed again before the
		// album art reexpands. This will reset the reexpand timeout
		// so that the art remains shrunk for the correct amount of
		// time for updates that occur when the timeout was previously
		// set.
		//

		//console.log("reset the timeout");

		updateTextAndSetReexpandTimeout();
	}
	else {

		// Otherwise just update the text
		//
		triggerTextUpdate();
	}
}

// Triggers the track, artist, and album text
// updates and sets the timeout for reexpanding
// the album art image.
//
function updateTextAndSetReexpandTimeout() {
	var trackScrollDuration  = calculateRightTransitionDuration($(".track").width(),  $(".dummyTrack").width());
	var artistScrollDuration = calculateRightTransitionDuration($(".artist").width(), $(".dummyArtist").width());
	var albumScrollDuration  = calculateRightTransitionDuration($(".album").width(),  $(".dummyAlbum").width());

	// Before reexpanding, give enough time for the longest text display to finish scrolling if necessary.
	//
	var timeoutMs = (infoScrollDelaySeconds * 1000) + (Math.max(trackScrollDuration, artistScrollDuration, albumScrollDuration, baseScrollDurationSeconds) * 1000) + infoScrollTimeoutMs;

	triggerTextUpdate();

	clearReexpandTimeout();
			
	reexpandTimeout = setTimeout(function(){
		$(".album_art").addClass("album_art_expanded");

		// Hide text when expanding
		//
		$("#displayedInfo").addClass("hideForExpansion");
	}, timeoutMs);
}

// Handler for when the album art is clicked on. When triggered,
// expands the album art to cover the whole screen while covering
// the displayed track, artist, and album info. Clicking again
// will shrink the art back down so that displayed info is
// visible again.
//
function albumArtClick() {

	// This class is both of the album art images
	//
	var albumArtElement = $(".album_art");

	// Clear the reexpand timeout since the art was interacted with
	//
	clearReexpandTimeout();
	
	// Disable clicking until the expand/shrink transition finishes.
	// Transition end event set for only one .album_art element to
	// prevent it triggering twice.
	//
	albumArtElement.addClass("noClick");
	$(".art_image_hidden").one("transitionend", function() {
		albumArtElement.removeClass("noClick");
	});

	// Expand/shrink the album art
	//
	if (albumArtElement.hasClass("album_art_expanded")) {
		albumArtElement.removeClass("album_art_expanded");

		// Reveal text when shrinking
		//
		$("#displayedInfo").removeClass("hideForExpansion");
	}
	else {
		albumArtElement.addClass("album_art_expanded");

		// Hide text when expanding
		//
		$("#displayedInfo").addClass("hideForExpansion");
	}
}

// Rotates the suggestions to the right and highlight the
// next suggestion. This can be triggered manually by click
// or automatically after a specified amount of time.
//
function shiftSuggestions() {
	
	// Clear the timeout that rotates suggestions
	//
	clearRotateSuggestionTimeout();

	// Grab the suggestion elements
	//
	var backLeft  = $(".backLeftSuggestion");
	var left      = $(".leftSuggestion");
	var center    = $(".centerSuggestion");
	var right     = $(".rightSuggestion");
	var backRight = $(".backRightSuggestion");
	var back      = $(".backSuggestion");

	// Get the image source for the left suggestion, since this will
	// become the center suggestion, we want the image source to
	// use for the blurred background
	//
	var nextBackground = left.attr("src");

	// Disable interaction until we finish shifting suggestions
	//
	$("#albumSuggestions").addClass("noClick");

	// Add the backSuggestion class, this won't do anything since the css
	// for .backRightSuggestion takes precedence over .backSuggestion
	//
	backRight.addClass("backSuggestion");

	// Add/remove relevant classes to trigger the transitions
	// for all the suggestions
	//
	back.addClass("backLeftSuggestion");
	backLeft.addClass("leftSuggestion");
	left.addClass("centerSuggestion");
	center.addClass("rightSuggestion");
	right.addClass("backRightSuggestion");
	backRight.removeClass("backRightSuggestion");

	// when the background blurred image fades to 0 opacity:
	// 1. change the image
	// 2. set the opacity so the new image is visible
	// 3. #2 triggers an event which reenables clicks to trigger
	//    suggestion rotations and resets the timeout for automatic
	//    suggestion rotations
	//
	$(".artwork_suggestion").one("transitionend", function() {

		// 1.
		//
		$(".artwork_suggestion").css("background-image", "url(" + nextBackground + ")");

		// 3.
		//
		$(".artwork_suggestion").one("transitionend", function() {
			$("#albumSuggestions").removeClass("noClick");

			rotateSuggestionTimeout = setTimeout(function() {
				shiftSuggestions();
			}, rotateSuggestionTimeoutMs);
		});

		// 2.
		//
		$(".artwork_suggestion").removeClass("hidden");
	});
	
	// Update the album name and artist that were stored
	// as attributes on the element
	//
	updateSuggestionText(left.attr("artist"), left.attr("album"));
	
	// Trigger the event above my fading out the background blur
	//
	$(".artwork_suggestion").addClass("hidden");

	// Cleanup by removing the classes for the old
	// positions for these elements
	//
	back.removeClass("backSuggestion");
	backLeft.removeClass("backLeftSuggestion");
	left.removeClass("leftSuggestion");
	center.removeClass("centerSuggestion");
	right.removeClass("rightSuggestion");
}

// Get suggestions that will be displayed
//
function getSuggestions() {
	albumSuggestions = SuggestionCollection.Suggestions;
}

// Picks random suggestions that are displayed
// every time the suggestions screen loads.
//
function chooseRandomSuggestions() {
	
	// Make a copy of suggestions since each random
	// choice will be removed from the array
	//
	var suggestionsCopy = albumSuggestions.slice();
	var randomChoices = [];

	// Randomly remove suggestions
	//
	for (var i = 0; i < 6; i++) {
		var index = Math.floor( Math.random()*suggestionsCopy.length );
    	randomChoices.push(suggestionsCopy.splice(index, 1)[0]);
	}

	return randomChoices;
}

// Clears the event listeners on the websocket
//
function clearWebsocketEvents() {

	// Shouldn't happen but here just in case
	//
	if (socket == null) {
		return;
	}
	
	socket.removeEventListener("open",    websocketOnOpen);
	socket.removeEventListener("close",   websocketOnErrorClose);
	socket.removeEventListener("error",   websocketOnErrorClose);
	socket.removeEventListener("message", websocketOnMessage);
}

// Event handler for when a websocket connection
// has been established with the server
//
function websocketOnOpen() {	
	console.log("socket connection open");
	
	// Successfully connected, so clear the interval that tries
	// to establish a connection
	//
	clearInterval(socketConnectionInterval);
	socketConnectionInterval = null;
		
	connectionEstablished = true;

	// Show the connection icon, and start the hiding transition
	//
	$("#connectedIcon").removeClass("noTransition");
	$("#connectingIcon").addClass("hidden");
	$("#connectedIcon").removeClass("hidden");
	$(".connectionInfoContainer").addClass("connected");
}

// Event handler for when a websocket connection
// is closed gracefully or due to an error
//
function websocketOnErrorClose() {
	console.log("socket closed");

	// Return to suggestions if currently displaying
	// now playing
	//
	if ($("#albumSuggestions").hasClass("hidden")) {
		swapToSuggestions();
	}
		
	connectionEstablished = false;
	clearWebsocketEvents();
	socket = null;
	
	// Show the loading spinner if it isn't already showing
	//
	if ($("#connectingIcon").hasClass("hidden")) {
		$("#connectedIcon").addClass("noTransition");
		$("#connectedIcon").addClass("hidden");
		$(".connectionInfoContainer").removeClass("connected");
		$("#connectingIcon").removeClass("hidden");
	}

	// Set the connection interval and try to reconnect
	//
	socketConnectionInterval = setInterval(function() {
		connectToWebsocket();
	}, socketConnectionIntervalMs);
}

// Event handler for when a message containing song
// data is received through the websocket connection
//
function websocketOnMessage(event) {
	var info = JSON.parse(event.data);
	
	var albumArtElements = $(".album_art");

	console.log(info);

	// If displaying suggestions, swap to now playing if able.
	// Otherwise, update the necessary info since we're on
	// now playing.
	//
	if ($("#main").hasClass("hidden")) {
		if (canSwapToNowPlaying()) {

			// Only swap to now playing if suggestions are not
			// still not in the middle of appearing
			//
			swapToNowPlaying(info);
		}
	}
	else {

		// If we didn't get a song match for the last audio sample
		//
		if (info["matched"] != true) {
			failedMatches += 1;

			// If the current album art is not the placeholder, don't update with
			// placeholder image and placeholder text until we meet the consecutive
			// failed match threshold.
			//
			if (!albumArtElements.hasClass("placeholderImage")) {
				if (failedMatches < failedMatchThreshold) {
					//console.log("consecutive failed matches below threshold for update");
					return;
				}
			}
			else {

				// Otherwise, if the current album art is the placeholder:
				// 1. Change the text to use the placeholder text if the
				//    consecutive failed match threshold has been met
				//    and the current placeholder image is displaying
				//    because the previous update did not have album art from
				//    Shazam and the placeholder is being shown as a result.
				// OR
				// 2. Change the text to use the placeholder text immediately
				//    if the previous update occurred because of a failed match.
				//    The failed match threshold won't be checked.
				//
				if (albumArtElements.attr("matched") != false && failedMatches < failedMatchThreshold) {
					return;
				}
				//console.log("record placeholder currently displayed");
			}
		}

		failedMatches = 0;
		updatePlayingScreen(info);
	}
}

// Set up all the event handlers related
// to websocket connection
//
function setUpWebsocketEvents() {
	socket.addEventListener("open",    websocketOnOpen);
	socket.addEventListener("close",   websocketOnErrorClose);
	socket.addEventListener("error",   websocketOnErrorClose);
	socket.addEventListener("message", websocketOnMessage);
}

// Repeatedly called every socketConnectionIntervalMs as
// part of socketConnectionInterval. Attempts to establish
// a connection to the server using websocket
//
function connectToWebsocket() {
	if (socket == null) {
		socket = new WebSocket(socketAddress);
		
		setUpWebsocketEvents();
		return;
	}
	
	if (socket.readyState == 0) { // connecting
		return;
	}
	else if (socket.readyState == 1) { // open
		// interval gets cleared on open event listener
		//
		return;
	}
	else if (socket.readyState == 2 || socket.readyState == 3) { // closing/closed
		// socket gets set to null and events get cleared in error/close listener
		//
		return;
	}
}

// Chooses random suggestions, displays them,
// and sets up the click handler and timeout
// for automatically for rotating suggestions
//
function showSuggestions() {
	
	// Grab the suggestion elements
	//
	var backLeft  = $(".backLeftSuggestion");
	var left      = $(".leftSuggestion");
	var center    = $(".centerSuggestion");
	var right     = $(".rightSuggestion");
	var backRight = $(".backRightSuggestion");
	var back      = $(".backSuggestion");

	// The blurred background images specifically
	// used for when suggestions are initially
	// displayed
	//
	var loadArtwork1 = $("#loadArtwork1");
	var loadArtwork2 = $("#loadArtwork2");
	var loadArtworks = $(".loadArtwork");

	// Get random suggestions
	//
	var suggestions      = chooseRandomSuggestions();
	var suggestionImages = [back, backLeft, left, center, right, backRight];

	// Get the artist and album for the center suggestion
	//
	var artistText = suggestions[3].artist;
	var albumText  = suggestions[3].album;

	// Set the image for each suggestion and also add the album
	// and artist as attributes that we can use to update the
	// displayed text when shifting suggestions
	//
	for (var i = 0; i < suggestionImages.length; i++) {
		suggestionImages[i].attr("src",    suggestions[i].art);
		suggestionImages[i].attr("artist", suggestions[i].artist);
		suggestionImages[i].attr("album",  suggestions[i].album);
	}

	// Set page title
	//
	$("title").text("Suggestions");

	// Clear the timeouts
	//
	clearRotateSuggestionTimeout();
	clearGetNewSuggestionTimeout();

	// Show each suggestion and fade in the blurred background
	//
	setTimeout(function() {
		back.removeClass("hiddenSuggestion");
		loadArtwork2.css("background-image", "url(" + back.attr("src") + ")").removeClass("hidden");
	}, 500);

	setTimeout(function() {
		backLeft.removeClass("hiddenSuggestion");
		loadArtwork1.css("background-image", "url(" + backLeft.attr("src") + ")").removeClass("hidden");
		loadArtwork2.addClass("hidden");
	}, 1250);

	setTimeout(function() {
		backRight.removeClass("hiddenSuggestion");
		loadArtwork1.addClass("hidden");
		loadArtwork2.css("background-image", "url(" + backRight.attr("src") + ")").removeClass("hidden");
	}, 2000);

	setTimeout(function() {
		left.removeClass("hiddenSuggestion");
		loadArtwork1.css("background-image", "url(" + left.attr("src") + ")").removeClass("hidden");
		loadArtwork2.addClass("hidden");
	}, 2750);

	setTimeout(function() {
		right.removeClass("hiddenSuggestion");
		loadArtwork1.addClass("hidden");
		loadArtwork2.css("background-image", "url(" + right.attr("src") + ")").removeClass("hidden");
	}, 3500);

	setTimeout(function() {

		// Set the artist and album text
		//
		updateSuggestionText(artistText, albumText);

		// Center suggestion transition is a bit longer than the blurred background transition, so wait for it
		//
		center.one("transitionend", function() {
			
			// Clear the loading blurred artworks
			//
			loadArtworks.css("background-image", "");

			$("#displayedInfo").one("transitionend", function() {

				// Set up click event for suggestion rotations
				//
				$("#albumSuggestions").on("click", function() {
					shiftSuggestions();
				});

				// Kick off automatic rotation timeout
				//
				rotateSuggestionTimeout = setTimeout(function() {
					shiftSuggestions();
				}, rotateSuggestionTimeoutMs);

				// Kick off new suggestions timeout
				//
				getNewSuggestionsTimeout = setTimeout(function() {
					getNewSuggestions();
				}, getNewSuggestionsTimeoutMs);
				
				// Can swap now that suggestions are done displaying
				//
				ableToSwapToNowPlaying = true;
			});

			// Display the artist and album text
			//
			$("#displayedInfo").removeClass("playingInfo").addClass("suggestionInfo");
			$("#displayedInfo").removeClass("hidden");
		});

		// Show the center suggestion and set the blurred backgorund image
		// used when rotating suggestions
		//
		center.removeClass("hiddenSuggestion");
		$(".artwork_suggestion").css("background-image", "url(" + center.attr("src") + ")");

		// Fade out the artworks used for the "loading" of suggestions
		//
		loadArtworks.addClass("hidden");

		// Fade in the blurred background that is used for suggestion rotation
		//
		$(".artwork_suggestion").removeClass("hidden");
	}, 4250);
}

// Begins the process of swapping from now playing
// to suggestions. Resets various elements back to
// an initial state so that they're ready for the
// next switch back to now playing
//
function swapToSuggestions() {
	clearReturnToSuggestionTimeout();

	clearReexpandTimeout();

	// Disable swapping until suggestions finish showing
	//
	ableToSwapToNowPlaying = false;

	// Reset failed matches count
	//
	failedMatches = 0;

	// Once the now playing container has completely faded,
	// reset elements back to an initial state
	//
	$("#main").one("transitionend", function() {
		$(".art_image").attr("src", "transparent1x1.png");
		$(".art_image_hidden").attr("src", "");
		$(".art_image_hidden").off("transitionend");
		
		$("#main").addClass("displayNone");
		$("#main").removeClass("noClick");

		$(".playingArtwork").css("background-image", "");

		var albumArtElements = $(".album_art");

		albumArtElements.removeClass("album_art_expanded");
		albumArtElements.removeClass("placeholderImage");
		albumArtElements.removeClass("noTransition");
		albumArtElements.attr("matched", null);
	});

	// Start fade out transition, disable click interactions
	//
	$("#main").addClass("noClick").addClass("hidden");

	// Hide both blurred background images
	//
	$("#playingBlur1").addClass("hidden");
	$("#playingBlur2").removeClass("shown");

	// Once the text fades, show the suggestions container element,
	// hide the individual suggestions themselves, then show suggestions.
	//
	$("#displayedInfo").one("transitionend", function() {
		$("#albumSuggestions").removeClass("displayNone").removeClass("hidden").removeClass("noClick");
		$(".suggestion").addClass("hiddenSuggestion");
		showSuggestions();
	});

	// Fade out about same time as now playing container
	//
	setTimeout(function() {
		$("#displayedInfo").removeClass("suggestionInfo").removeClass("hideForExpansion").addClass("hidden");
	}, 400);
}

// Display now playing and set the display
// using the song data that triggered the switch
//
function showNowPlaying(eventData) {

	// Set up container for display
	//
	$("#main").addClass("noClick");
	$("#main").removeClass("displayNone");

	// room for issue if socket closes before this triggers?
	//
	setTimeout(function() {

		// Fade in the container and the display text,
		// then update with the song data
		//
		$("#main").removeClass("hidden");
		$("#displayedInfo").addClass("playingInfo").removeClass("hidden");
		
		updatePlayingScreen(eventData);
		
		$("#main").removeClass("noClick");
	}, 500);
}

// Begins the process of swapping from suggestions
// to now playing. Resets various elements back to
// an initial state so that they're ready for the
// next switch back to suggestions
//
function swapToNowPlaying(eventData) {

	// Clear the timeouts
	//
	clearRotateSuggestionTimeout();
	clearGetNewSuggestionTimeout();

	// Once the text fades, begin showing the now playing screen
	//
	$("#displayedInfo").one("transitionend", function() {
		$(".track").text("");
		$(".artist").text("");
		$(".album").text("");
		showNowPlaying(eventData);
	});

	// Hide suggestions and the display text
	//
	hideSuggestions();
}

// Helper for checking if swapping from suggestions
// to now playing is possible. The two requirements
// are that a websocket connection has been established
// and that the suggestions have finished the appearing
// animation transition.
//
function canSwapToNowPlaying() {
	return connectionEstablished && ableToSwapToNowPlaying;
}

// General set up for the page for suggestions,
// event handlers, and shows suggestions.
//
function setUp() {
	
	// Kick off websocket connection attempts
	//
	socketConnectionInterval = setInterval(function() {
		connectToWebsocket();
	}, socketConnectionIntervalMs);
	
	// Get the suggestions, set up text transitions, and begin
	// showing the suggestions
	//
	getSuggestions();
	setUpTransitions();
	showSuggestions();
	
	// Set up top right drop down that allows swapping between
	// custom art and default art
	//
	$(".hoverContainer").on("click", function() {
		$(".hoverContent").addClass("shown");
		
		clearTimeout(actionMenuTimeout);
		actionMenuTimeout = null;
		
		actionMenuTimeout = setTimeout(function() {$(".hoverContent").removeClass("shown");}, actionMenuTimeoutMs);
	});
	
	// Set initial art icon state
	//
	if (useCustomArt) {
		$(".artIconStackIcon.fa-ban").addClass("visibilityHidden");
	}
	
	// Set up swapping to using custom art
	//
	$(".artIconStackIcon.fa-ban").on("click", function() {
		$(".artIconStackIcon.fa-ban").addClass("visibilityHidden");
		useCustomArt = true;
	});
	
	// Set up swapping to using default art
	//
	$(".artIconStackIcon.fa-paintbrush").on("click", function() {
		$(".artIconStackIcon.fa-ban").removeClass("visibilityHidden");
		useCustomArt = false;
	});

	// Set up the click handler for the now playing
	// album art that triggers shrink/expand
	//
	$(".art_image_hidden").on("click", function(event){
		albumArtClick();
	});
}

// Gets the right transition properties for the scrolling
// track, artist, and album text based on the width of the
// displayed text element and the full width of the dummy
// text element.
//
function getRightTransitionProps(displayedLength, fullLength) {
	return calculateRightTransitionDuration(displayedLength, fullLength) + "s ease-out " + infoScrollDelaySeconds + "s";
}

// Gets the opacity transition properties for the track,
// artist, and album text. The opacity transition properties
// differ for now playing and suggestions to fit the
// duration of other transitions unique to each mode.
//
function getOpacityTransitionProps() {

	// Transition properties for suggestions
	//
	if ($("#displayedInfo").hasClass("suggestionInfo")) {

		// .5x the .7s suggestion transition, see .suggestion in style.css
		//
		return "opacity " + opacityTextSuggestionsDurationSeconds + "s ease";
	}

	// Transition properties for now playing
	// .5x the 1.7s album art opacity transition, see .playingArtwork and .art_image_hidden in style.css
	//
	return "opacity " + opacityTextNowPlayingDurationSeconds + "s ease";
}

// Using the width of the displayed text and the width of the
// matching dummy text element, calculate the duration of the scroll
// from right to left.
//
function calculateRightTransitionDuration(displayedLength, fullLength) {

	var growthFactor             = fullLength / displayedLength;
	var calculatedScrollDuration = growthFactor * baseScrollDurationSeconds;

	// Transition properties for suggestions
	//
	if ($("#displayedInfo").hasClass("suggestionInfo")) {

		// The amount of time we have to display text is the length of the timeout until the next suggestion
		// rotation, minus the delay before scrolling starts and the time before scrolling resets.
		//
		// 15s - 2.5s - 3s = 9.5s
		//
		var maxScrollDuration = (rotateSuggestionTimeoutMs/1000) - (infoScrollTimeoutMs/1000) - infoScrollDelaySeconds;

		return Math.min(calculatedScrollDuration, maxScrollDuration);
	}

	// Transition properties for now playing
	//

	// The amount of time we have to display text is the amount of time between one each
	// websocket message containing song data. The main factor for this is the recording
	// length, with the time it takes to get a Shazam result playing a much smaller
	// role (~1.5s with 15s recording length for a total of about ~16.5s between messages,
	// unsure how this changes as recording length changes). The amount of time for the text
	// to scroll will be the approximate 16.5s minus the delay before scrolling starts and
	// the time before scrolling resets. To give some room for error in terms of scroll duration,
	// use 15s rather than 16.5s to calculate the max scroll duration.
	//
	// 15s - 2.5s - 3s = 9.5s
	//
	// May need to subtract opacityTextNowPlayingDurationSeconds * 2 as well since that takes away from the
	// time to display, but only on the case when a song has just changed (and changed immediately after).
	// In that scenario, infoScrollTimeoutMs will get cut off, so the scroll itself won't get cut short.
	// Shouldn't need to change since opacityTextNowPlayingDurationSeconds * 2 only comes into play
	// when a track, artist, or album change occurs.
	//
	var maxScrollDuration = recordingDurationSeconds - (infoScrollTimeoutMs/1000) - infoScrollDelaySeconds;

	return Math.min(calculatedScrollDuration, maxScrollDuration);
}

// Clear the text transitions for the text element itself, the wrapper
// element used for fading, and the corresponding timeout.
//
function clearTextTransitions(textElementClass, fadeWrapperElementClass, scrollTimeout) {
	clearTimeout(scrollTimeout);
	scrollTimeout = null;
	$(textElementClass).css("right", "0px").css("transition", "none").off("transitionend");
	$(fadeWrapperElementClass).css("transition", "none").off("transitionend");
}

// Clear the transitions for the track, artist, and album displayed text
//
function clearTransitions() {
	clearTextTransitions(".track",  ".trackFadeWrapper",  trackScrollTimeout);
	clearTextTransitions(".artist", ".artistFadeWrapper", artistScrollTimeout);
	clearTextTransitions(".album",  ".albumFadeWrapper",  albumScrollTimeout);
}

// Set up the text transitions for the displayed text element, the dummy
// text element, the wrapper element used for fading, and the corresponding
// timeout.
//
function setUpTextTransitions(textElementClass, dummyTextElementClass, fadeWrapperElementClass, scrollTimeout) {
	var textElement        = $(textElementClass);
	var dummyTextElement   = $(dummyTextElementClass);
	var fadeWrapperElement = $(fadeWrapperElementClass);
	
	// Once the text element finishes scrolling to the left,
	// let it stay briefly before resetting it back to its
	// original position. Then set up the scrolling transition
	// again.
	//
	textElement.on("transitionend", function(event){
		scrollTimeout = setTimeout(function(){
			textElement.css("transition", "none");
			textElement.css("right", "0px");

			setUpTextElementScroll(textElement, dummyTextElement);
		}, infoScrollTimeoutMs);
	});
		
	// When the fade wrapper element opacity is 0, it means the
	// text needs to be changed. Clear the transitions, change the
	// text using the dummy text element's current text, set the
	// transitions back up, then change the opacity back to 1.
	//
	// When the fade wrapper element opacity is 1, apply the
	// transition style so that the text will begin scrolling.
	//
	fadeWrapperElement.on("transitionend", function(event){
		if (fadeWrapperElement.css("opacity") == 0) {
			clearTextTransitions(textElementClass, fadeWrapperElementClass, scrollTimeout);
			textElement.text(dummyTextElement.text());
			setUpTextTransitions(textElementClass, dummyTextElementClass, fadeWrapperElementClass);
			fadeWrapperElement.css("opacity", 1);
		}
		else if (fadeWrapperElement.css("opacity") == 1) {
			setUpTextElementScroll(textElement, dummyTextElement);
		}
	});

	setUpTextElementScroll(textElement, dummyTextElement);
	fadeWrapperElement.css("transition", getOpacityTransitionProps());
}

// Set up scrolling for a text element when provided with
// both the text element and its corresponding dummy text element
//
function setUpTextElementScroll(textElement, dummyTextElement) {
	textElement.css("transition", "right " + getRightTransitionProps(textElement.width(), dummyTextElement.width()));
	textElement.css("right", Math.max(0, textElement.attr("maxRight")) + "px");
}

// Set up transitions for each text display and the corresponding timeout
//
function setUpTransitions() {
	setUpTextTransitions(".track",  ".dummyTrack",  ".trackFadeWrapper",  trackScrollTimeout);
	setUpTextTransitions(".artist", ".dummyArtist", ".artistFadeWrapper", artistScrollTimeout);
	setUpTextTransitions(".album",  ".dummyAlbum",  ".albumFadeWrapper",  albumScrollTimeout);
}

// Hide the suggestions and the display text
//
function hideSuggestions(eventData) {

	// Disable the events that cause rotations
	//
	$(".artwork_suggestion").off("transitionend");
	$("#albumSuggestions").off("click");

	// After the fade out transition, set up for next switch
	//
	$("#albumSuggestions").one("transitionend", function() {
		$("#albumSuggestions").addClass("displayNone");
		$(".artwork_suggestion").addClass("hidden");
		$(".artwork_suggestion").css("background-image", "");
	});

	// Start fade out transition, disable click interactions
	//
	$("#albumSuggestions").addClass("noClick").addClass("hidden");

	// Set to fade at about same time as suggestions container
	//
	setTimeout(function() {
		$("#displayedInfo").removeClass("suggestionInfo").addClass("hidden");
	}, 400);
}

// Clears the currently displayed suggestions and displays
// a new random set of suggestions
//
function getNewSuggestions() {
	ableToSwapToNowPlaying = false;

	// Clear the auto rotate timeout
	//
	clearRotateSuggestionTimeout();

	// Hide what's currently displayed
	//
	hideSuggestions();

	// Prepare elements so they are ready to reappear, then
	// display the new suggestions
	//
	setTimeout(function() {
		$(".track").text("");
		$(".artist").text("");
		$(".album").text("");

		$("#albumSuggestions").removeClass("displayNone").removeClass("hidden").removeClass("noClick");
		$(".suggestion").addClass("hiddenSuggestion");

		showSuggestions();
	}, 1500);
}