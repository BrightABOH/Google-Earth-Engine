// load table data from collect earth.

var country = table2
var region = table2.geometry()
Map.addLayer(region)
var rwanda = ee.FeatureCollection("users/sbrightaboh/edem");
print(rwanda.size())
Map.addLayer(rwanda,{color:"red"},'Rwanda');
print(rwanda)
// Load input data. We use Landsat 8 in our case. we filter this based on the date and location
var l8 = ee.ImageCollection('LANDSAT/LC08/C01/T1')
      .filterDate('2006-01-01','2020-1-31')
      //.filterBounds(rwanda)
      //.filter('CLOUDY_PIXEL_PERCENTAGE < 50');
print(l8.size())      



var image = ee.Algorithms.Landsat.simpleComposite({
collection: l8.filterDate('2000-01-01', '2020-01-31'),
percentile:50,
cloudScoreRange: 5,
            
               
asFloat: true
});



// Define these bands to be use for prediction.
var bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

// Load training points from our table data. The numeric column  "_land_us_1" stores known labels.


// This property of the table stores the land cover labels.
var label = "_land_us_1";

// We overlay the points on the imagery to get training.
var training = image.select(bands).sampleRegions({
collection: rwanda,
properties: [label],
scale: 30
})

// Train classifier with ML algorithm We test various algorithms,CART classifier came with the best results.
var trained = ee.Classifier.smileCart()
                .train(training, label, bands)
                .setOutputMode("Classification");
              
print('CART error matrix: ', trained.confusionMatrix())
print("CART accuracy",trained.confusionMatrix().accuracy())
// Classify the image with the same bands used for training.
var classified = image.select(bands).classify(trained).clip(region);

// Display the inputs and the results.
Map.centerObject(rwanda, 11);

Map.addLayer(classified,
             {min: 1, max: 6, palette: ['brown', 'darkorange','blue','black','purple','cyan']},
             'classification');
             
             
print("classification legnd:","brown: forest","darkorange: cropland","blue: Otherland", "black: grassland", "purple: wetland","cyan: settlement")

var names = ["forest","cropland","otherland","grassland","wetland","settlement"]
var values = ['1','2','3','4','5','6']
//We define legend of the map

var elevationPalette = ['993333','ff8c00', '0066ff','000000', 'cc00cc', '00ffff'];

// set position of panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px'
  }
});
 
// Create legend title
// Create legend title
var legendTitle = ui.Label({
  value: 'LAND CLASSIFICATION ',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});


// Add the title to the panel
legend.add(legendTitle);
 
var makeRow = function(color, name) {

  // Create the label that is actually the colored box.
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      // Use padding to give the box height and width.
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });

// Create the label filled with the description text.
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });

  // return the panel
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};
 
 
 // Add color and and names
for (var i = 0; i < 6; i++) {
  legend.add(makeRow(elevationPalette[i], names[i]));
  }  

// Add the legend to the map.
Map.add(legend);

//Map.addLayer(image.clip(rwanda), {}, false);



//CHART RESULTS:
var options = {
  lineWidth: 1,
  pointSize: 2,
  hAxis: {title: 'Classes'},
  vAxis: {title: 'Area m^2'},
  title: 'Area by class',
  series: {
   1: { color: 'red'},
   2: { color: 'green'},
   3: { color: 'blue'},
   4: { color: 'cyan'},
   5: { color: 'purple'},
   6: { color: 'black'},
    
  }
};


var areaChart = ui.Chart.image.byClass({
  image: ee.Image.pixelArea().addBands(classified),
  classBand: 'classification', 
  region: rwanda,
  scale: 30,
  reducer: ee.Reducer.sum()
  }).setOptions(options)
  .setSeriesNames(['forest', 'cropland', 'otherland','grassland','wetland','settlement']);
print(areaChart);

//We divide our data set into testing and training . So that we can evaluate the performance of our model
var withRandom = training.randomColumn();

// Approximately 70% of our training data
var trainingPartition = withRandom.filter(ee.Filter.lt('random', 0.7));
// Approximately 30% of our training data
var testingPartition = withRandom.filter(ee.Filter.gte('random', 0.7));
var trained2 = ee.Classifier.cart().train(testingPartition, label, bands);

print(testingPartition)
print(testingPartition)
var test = testingPartition.classify(trained2);



print('CART Testing error matrix: ', trained2.confusionMatrix())
print("CART Testing accuracy",trained2.confusionMatrix().accuracy())
//print(test)

var confusionMatrix = test.errorMatrix(label, 'classification');
print(confusionMatrix);



//var out = landcover_roi.classify(classifier);

var stats = ee.Image.pixelArea().addBands(classified).reduceRegion({
reducer: ee.Reducer.sum().group(1), 
geometry: rwanda, 
scale: 25,
});
print('Land cover area in hactares', stats);

//Export.image.toDrive({ 
//image: classified,
//description: 'imageclassification',
//scale: 30,
//region: table2
//});

// Map a function over the Landsat 8 TOA collection to add an NDVI band.
var withNDVI = l8.map(function(image) {
  var ndvi = image.normalizedDifference(['B5', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
});

// Create a chart showing the NVDI vlaues from our AIO.
var chart = ui.Chart.image.series({
  imageCollection: withNDVI.select('NDVI'),
  region: rwanda,
  reducer: ee.Reducer.first(),
  scale: 30
}).setOptions({title: 'NDVI over time'});

// Display the chart in the console.
print(chart);



//Select the class from the classified image
var veg = classified.select('classification').eq(2);//vegetation has 1 value in your case

//Calculate the pixel area in square kilometer
var area_veg = veg.multiply(ee.Image.pixelArea()).divide(6);

//Reducing the statistics for your study area
var stat = area_veg.reduceRegion ({
  reducer: ee.Reducer.sum(),
  geometry: rwanda,
  scale: 26,
  maxPixels: 1e9
});

//Get the sq km area for vegetation
print ('Vegetation Area (in sq.km)', stat);

