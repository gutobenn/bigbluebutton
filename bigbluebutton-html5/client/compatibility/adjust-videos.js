
(function() {
  function adjustVideos(tagId, videoDockClass, visibleVideoClass) {
    const _minContentAspectRatio = 16 / 9.0;

    function calculateOccupiedArea(canvasWidth, canvasHeight, numColumns, numRows, numChildren) {
      const obj = calculateCellDimensions(canvasWidth, canvasHeight, numColumns, numRows);
      obj.occupiedArea = obj.width * obj.height * numChildren;
      obj.numColumns = numColumns;
      obj.numRows = numRows;
      obj.cellAspectRatio = _minContentAspectRatio;
      return obj;
    }

    function calculateCellDimensions(canvasWidth, canvasHeight, numColumns, numRows) {
      const obj = {
        width: Math.floor(canvasWidth / numColumns),
        height: Math.floor(canvasHeight / numRows),
      };

      if (obj.width / obj.height > _minContentAspectRatio) {
        obj.width = Math.min(Math.floor(obj.height * _minContentAspectRatio), Math.floor(canvasWidth / numColumns));
      } else {
        obj.height = Math.min(Math.floor(obj.width / _minContentAspectRatio), Math.floor(canvasHeight / numRows));
      }
      return obj;
    }

    function findBestConfiguration(canvasWidth, canvasHeight, numChildrenInCanvas) {
      let bestConfiguration = {
        occupiedArea: 0,
      };

      for (let cols = 1; cols <= numChildrenInCanvas; cols++) {
        let rows = Math.floor(numChildrenInCanvas / cols);

        // That's a small HACK, different from the original algorithm
        // Sometimes numChildren will be bigger than cols*rows, this means that this configuration
        // can't show all the videos and shouldn't be considered. So we just increment the number of rows
        // and get a configuration which shows all the videos albeit with a few missing slots in the end.
        //   For example: with numChildren == 8 the loop will generate cols == 3 and rows == 2
        //   cols * rows is 6 so we bump rows to 3 and then cols*rows is 9 which is bigger than 8
        if (numChildrenInCanvas > cols * rows) {
          rows += 1;
        }

        const currentConfiguration = calculateOccupiedArea(canvasWidth, canvasHeight, cols, rows, numChildrenInCanvas);

        if (currentConfiguration.occupiedArea > bestConfiguration.occupiedArea) {
          bestConfiguration = currentConfiguration;
        }
      }

      return bestConfiguration;
    }

    // http://stackoverflow.com/a/3437825/414642
    const e = $("." + videoDockClass);
    const x = e.outerWidth() - 1;
    const y = e.outerHeight() - 1;

    const videos = $("#" + tagId + " ." + visibleVideoClass);

    const best = findBestConfiguration(x, y, videos.length);

    $("#" + tagId).css('grid-template-columns', 'repeat(' + best.numColumns + ', ' + best.width + 'px)');
    // TODO It would be better to use 'auto' as second parameter for repeat, but it doesn't work because of the videoWrapper class, added for compatibility with firefox 59
    videos.find('video').trigger('play'); // Force videos to restart. On Chrome, when the layout is swapped the videos stop, because they're reparented.
  }

  window.adjustVideos = adjustVideos;
})();
