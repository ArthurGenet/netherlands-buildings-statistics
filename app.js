
// PARAMETERS //
// These are the fields you need to change to create your own Web App

// The id of your Web Scene (it is better if it is a Global WebScene to be able to use the Buffer)
var webscene_id = "cbf7bc42693046b8b8afce4c7b07b1e0";

// The layer name in your Web Scene
var webscene_layer_name = "BAG 3D - (WGS) - BAG 3D";

// The name of your field you want to display in your pie chart
var pie_chart_field_name = "Gebruiksdoel";

// The name of the field you want to display in your histogram
var histogram_field_name = "Bouwjaar";

// The attributes for each slice of the pie you want to display
var list_pie_chart_attributes = ["bijeenkomstfunctie", "gezondheidszorgfunctie", "industriefunctie", 
"kantoorfunctie", "logiesfunctie", "onderwijsfunctie", "overige gebruiksfunctie","sportfunctie",
"winkelfunctie", "woonfunctie"];

// The list of colors for the pie chart
// it should be the length of "list_pie_chart_attributes"
var list_pie_chart_color = ["#00ffc5", "#e69800", "#b53535", "#8400a8", "#376cbd", "#e600a9", "#734c00", 
"#65A843", "#FFFF00", "#E1E1E1"];

// The range attributes for your histogram: 
// For example [1600,1700,1800,1900,2000] will range values from 1600 to 1700, 1700 to 1800, 1800 to 1900 
// and 1900 to 2000
var list_histogram_attributes = [1600,1700,1800,1900,2000];

// Create another range to include all previous values: true or false
// For example, if we have list_histogram_attributes = [1600,1700,1800,1900,2000], 
// we will have another range with all data before 1600
var before_first_date = true;

// Create another range to include all next values: true or false
var after_last_date = true;

// The labels you want to put for your histogram
// The length should be the length of the "list_histogram_attributes" + 1 if "before_first_date" is true and 
//+ 1 if "after_last_date" is true
var labels_for_histogram = ["-1600", "1600-1699", "1700-1799", "1800-1899", "1900-1999", "2000-"];

// The title of the pie chart
var title_pie_chart = "Building type";

// The title of the histogram
var title_histogram = "Year of build";

// END OF PARAMETERS


// Requirement for the Web App

require([
	"esri/WebScene",
	"esri/views/SceneView",
	"esri/layers/GraphicsLayer",
	"esri/widgets/Sketch/SketchViewModel",
	"esri/widgets/Slider",
	"esri/geometry/geometryEngine",
	"esri/Graphic",
	"esri/core/promiseUtils"
	], function(
		WebScene,
		SceneView,
		GraphicsLayer,
		SketchViewModel,
		Slider,
		geometryEngine,
		Graphic,
		promiseUtils
	) {

		// Load webscene and display it in a SceneView
		const webscene = new WebScene({
			portalItem: {
			id: webscene_id
			}
		});

		// create the SceneView
		const view = new SceneView({
			container: "viewDiv",
			map: webscene
		});
		window.view = view;

		// add a GraphicsLayer for the sketches and the buffer
		const sketchLayer = new GraphicsLayer();
		const bufferLayer = new GraphicsLayer();
		
		view.map.addMany([bufferLayer, sketchLayer]);
		let sceneLayer = null;
		let sceneLayerView = null;
		let bufferSize = 0;

		// Assign scene layer once webscene is loaded and initialize UI
		webscene.load().then(function() {
			sceneLayer = webscene.layers.find(function(layer) {
				return layer.title === webscene_layer_name;
			});

			// Only load the fields for the 2 graphics	
			sceneLayer.outFields = [pie_chart_field_name, histogram_field_name];
			// No popup when clicked
			sceneLayer.popupEnabled = false;
			view.whenLayerView(sceneLayer).then(function(layerView) {
				sceneLayerView = layerView;
				queryDiv.style.display = "block";
			});
		});

		view.watch("updating", function(updating) {
			// wait for the Scene view to finish updating
			if (!updating) { 
				runQuery();
			}
		});

		view.ui.add([queryDiv], "bottom-left");
		view.ui.add([resultDiv], "top-right");
		// use SketchViewModel to draw polygons that are used as a query
		let sketchGeometry = null;

		const sketchViewModel = new SketchViewModel({
			layer: sketchLayer,
			defaultUpdateOptions: {
				tool: "reshape",
				toggleToolOnClick: false
				},
			view: view
		});

		// When a graphic is drawn for the first time
		sketchViewModel.on("create", function(event) {
			if (event.state === "complete") {
				sketchGeometry = event.graphic.geometry;
				runQuery();
			}
		});

		// When we draw another graphic
		sketchViewModel.on("update", function(event) {
			if (event.state !== "cancel" && event.graphics.length) {
				sketchGeometry = event.graphics[0].geometry;
				runQuery();
			}
		});

		// draw geometry buttons - use the selected geometry to sketch
		document
			.getElementById("point-geometry-button")
			.addEventListener("click", geometryButtonsClickHandler);
		document
			.getElementById("line-geometry-button")
			.addEventListener("click", geometryButtonsClickHandler);
		document
			.getElementById("polygon-geometry-button")
			.addEventListener("click", geometryButtonsClickHandler);

		function geometryButtonsClickHandler(event) {
			const geometryType = event.target.value;
			// Each time we click to draw a new geometry, we clear the old one
			clearGeometry();
			// Create geometry
			sketchViewModel.create(geometryType);
		}

		const bufferNumSlider = new Slider({
			container: "bufferNum",
			min: 0,
			max: 500,
			steps: 1,
			labelsVisible: true,
			precision: 0,
			labelFormatFunction: function(value, type) {
				return value.toString() + "m";
			},
			values: [0]
		});
		// get user entered values for buffer
		bufferNumSlider.on("value-change", bufferVariablesChanged);
		function bufferVariablesChanged(event) {
			bufferSize = event.value;
			runQuery();
		}

		// Button "Clear" : Clear the geometry and set the default renderer
		document
			.getElementById("clearGeometry")
			.addEventListener("click", clearGeometry);
		// Clear the geometry and set the default renderer
		function clearGeometry() {
			sketchGeometry = null;
			sketchViewModel.cancel();
			sketchLayer.removeAll();
			bufferLayer.removeAll();
			clearHighlighting();
			clearCharts();
			resultDiv.style.display = "none";
		}

		// Set the geometry query on the visible SceneLayerView
		var debouncedRunQuery = promiseUtils.debounce(function() {
			if (!sketchGeometry) {
				return;
			}
			resultDiv.style.display = "block";
			// Update buffer
			updateBufferGraphic(bufferSize);
			return promiseUtils.eachAlways([
				// Now we have displayed the geometry, we can make the statistics
				queryStatistics(),
				updateSceneLayer()
			]);
		});

		function runQuery() {
			debouncedRunQuery().catch((error) => {
				// If the request is aborted
				if (error.name === "AbortError") {
					return;
				}
			console.error(error);
			});
		}

		// Set the renderer with objectIds
		var highlightHandle = null;

		// Remove the highlighting
		function clearHighlighting() {
			if (highlightHandle) {
				highlightHandle.remove();
				highlightHandle = null;
			}
		}

		// Highlight selected features
		function highlightBuildings(objectIds) {
			// Remove any previous highlighting
			clearHighlighting();
			const objectIdField = sceneLayer.objectIdField;
			// Display the length of objectIds: the number of selected features
			document.getElementById("count").innerHTML = objectIds.length;
			// Highlight all features in objectIds
			highlightHandle = sceneLayerView.highlight(objectIds);
		}


		var bufferGeometry = 0;
		// update the graphic with buffer
		function updateBufferGraphic(buffer) {
			// add a polygon graphic for the buffer
			// if buffer size > 0
			if (buffer > 0) {
				var bufferGeometry = geometryEngine.geodesicBuffer(
					sketchGeometry,
					buffer, // buffer size
					"meters"
				);
				// if there is not already a buffer, we create one
				if (bufferLayer.graphics.length === 0) {
					bufferLayer.add(
						new Graphic({
							geometry: bufferGeometry,
							symbol: sketchViewModel.polygonSymbol
						})
					);
				} 
				// if there is already a buffer, we modify it
				else {
					bufferLayer.graphics.getItemAt(0).geometry = bufferGeometry;
				}
			} 
			// if the user select "0" for the buffer size, we remove the previous one
			else {
				bufferLayer.removeAll();
			}
		}

		// update the Scene Layer when the geometry drawing isfinished by highlighting the selection
		function updateSceneLayer() {
			const query = sceneLayerView.createQuery();
			query.geometry = sketchGeometry;
			query.distance = bufferSize;
			return sceneLayerView.queryObjectIds(query).then(highlightBuildings);
		}

		var histogram = null;
		var pieChart = null;

		// Query the statistics for each diagram
		function queryStatistics() {

			// Create an array to store all our statistics
			var statDefinitions = [];

			// For each type of attributes in the pie chart, we sum the number of selected features with this attribute
			for (let i = 0; i < list_pie_chart_attributes.length; i++) {
				statDefinitions.push({
					onStatisticField: 
					"CASE WHEN " + pie_chart_field_name + " = '" + list_pie_chart_attributes[i] + "' THEN 1 ELSE 0 END",
					outStatisticFieldName: list_pie_chart_attributes[i],
					statisticType: "sum"
				})
				
			}

			// We sum the selected features included in each range for the histogram
			for (let i = 0; i < list_histogram_attributes.length - 1; i++) {
				statDefinitions.push({
					onStatisticField: 
					"CASE WHEN " + histogram_field_name + " >= " + list_histogram_attributes[i] + " AND " 
					+ histogram_field_name + " < " + list_histogram_attributes[i+1] + " THEN 1 ELSE 0 END",
					outStatisticFieldName: "" + list_histogram_attributes[i] + "",
					statisticType: "sum"
				})
				
			}

			// If before_first_date is true, we sum all selected features included before the first histogram value
			if (before_first_date == true){
				statDefinitions.push({
					onStatisticField: 
					"CASE WHEN " + histogram_field_name + " < " + list_histogram_attributes[0] + " THEN 1 ELSE 0 END",
					outStatisticFieldName: "before",
					statisticType: "sum"
				})
			}

			// If after_last_date is true, we sum all selected features included after the last histogram value
			if (after_last_date == true){
				statDefinitions.push({
					onStatisticField: 
					"CASE WHEN " + histogram_field_name + " >= " 
					+ list_histogram_attributes[list_histogram_attributes.length - 1] + " THEN 1 ELSE 0 END",
					outStatisticFieldName: "after",
					statisticType: "sum"
				})
			}

		// Creation of a new query on the view
		var query = sceneLayerView.createQuery();
		// The query is on the selected features
		query.geometry = sketchGeometry;
		// It takes account of the buffer size
		query.distance = bufferSize;
		// The array 
		query.outStatistics = statDefinitions;

		return sceneLayerView.queryFeatures(query).then(function(result) {

			var allStats = result.features[0].attributes;
			var updateChartList =[];
			
			for (let i = 0; i < list_pie_chart_attributes.length; i++){

				updateChartList.push(allStats[list_pie_chart_attributes[i]]);
			}

			updateChart(pieChart, updateChartList);

			var updateHistoList =[];
			
			for (let i = 0; i < list_histogram_attributes.length - 1; i++){

				if (i == 0){
					if (before_first_date == true){
						updateHistoList.push(allStats["before"]);
					}
				}

				updateHistoList.push(allStats[list_histogram_attributes[i]]);

				if (i == list_histogram_attributes.length - 2){


					if (after_last_date == true){
						updateHistoList.push(allStats["after"]);
					}
				}

			}

			updateChart(histogram, updateHistoList);

			
		}, console.error);

		}

		// Updates the given chart with new data
		function updateChart(chart, dataValues) {
			chart.data.datasets[0].data = dataValues;
			chart.update();
		}

		function createHistogram() {
			const histogramCanvas = document.getElementById("year-chart");
			histogram = new Chart(histogramCanvas.getContext("2d"), {
				type: "horizontalBar",
				data: {
					labels: labels_for_histogram,
					datasets: [
						{
						label: title_histogram,
						backgroundColor: "#149dcf",
						stack: "Stack 0",
						data: [0, 0, 0, 0, 0, 0]
						}
					]
				},
				options: {
					responsive: false,
					legend: {
						display: false
					},
				title: {
					display: true,
					text: title_histogram
				},
				scales: {
					xAxes: [
					{
						stacked: true,
						ticks: {
							beginAtZero: true,
							precision: 0
						}
					}
					],
					yAxes: [
					{
						stacked: true
					}
					]
				}
			}
		});
		}

		function createPieChart() {
		const pieChartCanvas = document.getElementById("material-chart");
		pieChart = new Chart(pieChartCanvas.getContext("2d"), {
			type: "doughnut",
			data: {
				labels: list_pie_chart_attributes,
				datasets: [
				{
					backgroundColor: list_pie_chart_color,
					borderWidth: 0,
					data: [0, 0, 0, 0, 0]
				}
				]
			},
			options: {
				responsive: false,
				cutoutPercentage: 35,
				legend: {
					position: "bottom",
					align: "start"
				},
				title: {
					display: true,
					text: title_pie_chart
				}
			}
		});
		}
		function clearCharts() {
			updateChart(pieChart, [0, 0, 0, 0, 0]);
			updateChart(histogram, [0, 0, 0, 0, 0, 0]);
			document.getElementById("count").innerHTML = 0;
		}
		createHistogram();
		createPieChart();

		var canvas_pie_chart = document.getElementById("material-chart");
		var canvas_histogram = document.getElementById("year-chart");

		var test_click_on_pie_chart = 0;
		var test_click_on_histogram = 0;

		canvas_pie_chart.onclick = function(evt) {

	    var activePointsPieChart = pieChart.getElementsAtEvent(evt);

	    if (activePointsPieChart[0]) {

	        var chartData = activePointsPieChart[0]['_chart'].config.data;
	        var idx = activePointsPieChart[0]['_index'];
		    var label = chartData.labels[idx];

		    if (test_click_on_pie_chart == 0){
		      	test_click_on_pie_chart = 1;

		        sceneLayer.definitionExpression = pie_chart_field_name + " LIKE '" + label + "'";
		    }   	
		      	
		    else{
		        test_click_on_pie_chart = 0
		      	sceneLayer.definitionExpression = "1 = 1";
		    }
		}
		};

		canvas_histogram.onclick = function(evt) {

	    var activePointsHistogram = histogram.getElementsAtEvent(evt);
		if (activePointsHistogram[0]) {

	        var chartData = activePointsHistogram[0]['_chart'].config.data;
	        var idx = activePointsHistogram[0]['_index'];
		    var label = chartData.labels[idx];

		    if (test_click_on_histogram == 0){
		      	test_click_on_histogram = 1;
				index_in_labels = labels_for_histogram.indexOf(label);
				if (index_in_labels == 0){
					if (before_first_date == true){
		        		sceneLayer.definitionExpression = histogram_field_name + " < " + list_histogram_attributes[0];
					}
					else{
						sceneLayer.definitionExpression = histogram_field_name + " >= " + list_histogram_attributes[0] + 
						" AND " + histogram_field_name + " < " + list_histogram_attributes[1];
					}
				}
				
				else if (index_in_labels == labels_for_histogram.length-1){

					if (after_last_date == true){
						sceneLayer.definitionExpression = histogram_field_name + " >= " +
						list_histogram_attributes[list_histogram_attributes.length-1];
					}
					else{
						sceneLayer.definitionExpression = histogram_field_name + " >= " + 
						list_histogram_attributes[list_histogram_attributes.length-2] + " AND " + 
						histogram_field_name + " < " + list_histogram_attributes[list_histogram_attributes.length-1];
					}
				}
				else{
					if(before_first_date == true){
						sceneLayer.definitionExpression = histogram_field_name + " >= " + 
						list_histogram_attributes[index_in_labels-1] + " AND " + 
						histogram_field_name + " < " + list_histogram_attributes[index_in_labels];
					}
					else{
						sceneLayer.definitionExpression = histogram_field_name + " >= " + 
						list_histogram_attributes[index_in_labels] + " AND " + 
						histogram_field_name + " < " + list_histogram_attributes[index_in_labels+1];
					}
				}
		    }   	
		      	
		    else{
		        test_click_on_histogram = 0
		      	sceneLayer.definitionExpression = "1 = 1";
		    }
		}
		};
	

});

				
      				