require([
			"esri/WebScene",
			"esri/views/SceneView",
			"esri/layers/GraphicsLayer",
			"esri/widgets/Sketch/SketchViewModel",
			"esri/widgets/Slider",
			"esri/geometry/geometryEngine",
			"esri/Graphic",
			"esri/tasks/support/Query",
			"esri/core/promiseUtils"
			], function(
				WebScene,
				SceneView,
				GraphicsLayer,
				SketchViewModel,
				Slider,
				geometryEngine,
				Graphic,
				Query,
				promiseUtils
			) {

				// Load webscene and display it in a SceneView
				const webscene = new WebScene({
					portalItem: {
					id: "6b8155167bb049268b791277a5dd6757"
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
						return layer.title === "BAG 3D - Rijksdriehoeksstelsel - BAG 3D";
					});

					sceneLayer.outFields = ["Gebruiksdoel", "Bouwjaar"];
					view.whenLayerView(sceneLayer).then(function(layerView) {
						sceneLayerView = layerView;
						queryDiv.style.display = "block";
					});
				});
				view.watch("updating", function(updating) {
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

				sketchViewModel.on("create", function(event) {
					if (event.state === "complete") {
						sketchGeometry = event.graphic.geometry;
						runQuery();
					}
				});

				sketchViewModel.on("update", function(event) {
					if (event.state !== "cancel" && event.graphics.length) {
						sketchGeometry = event.graphics[0].geometry;
						runQuery();
					}
				});

				// draw geometry buttons - use the selected geometry to sktech
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
					clearGeometry();
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
				// Clear the geometry and set the default renderer
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

				// set the geometry query on the visible SceneLayerView
				var debouncedRunQuery = promiseUtils.debounce(function() {
					if (!sketchGeometry) {
						return;
					}
					resultDiv.style.display = "block";
					updateBufferGraphic(bufferSize);
					return promiseUtils.eachAlways([
						queryStatistics(),
						updateSceneLayer()
					]);
				});

				function runQuery() {
					debouncedRunQuery().catch((error) => {
						if (error.name === "AbortError") {
							return;
						}
					console.error(error);
					});
				}

				// Set the renderer with objectIds
				var highlightHandle = null;
				function clearHighlighting() {
					if (highlightHandle) {
						highlightHandle.remove();
						highlightHandle = null;
					}
				}

				function highlightBuildings(objectIds) {
					// Remove any previous highlighting
					clearHighlighting();
					const objectIdField = sceneLayer.objectIdField;
					document.getElementById("count").innerHTML = objectIds.length;
					highlightHandle = sceneLayerView.highlight(objectIds);
				}

				var bufferGeometry = 0;
				// update the graphic with buffer
				function updateBufferGraphic(buffer) {
					// add a polygon graphic for the buffer
					if (buffer > 0) {
						var bufferGeometry = geometryEngine.geodesicBuffer(
							sketchGeometry,
							buffer,
							"meters"
						);
						if (bufferLayer.graphics.length === 0) {
							bufferLayer.add(
								new Graphic({
									geometry: bufferGeometry,
									symbol: sketchViewModel.polygonSymbol
								})
							);
						} 
						else {
							bufferLayer.graphics.getItemAt(0).geometry = bufferGeometry;
						}
					} 
					else {
						bufferLayer.removeAll();
					}
				}

				function updateSceneLayer() {
					const query = sceneLayerView.createQuery();
					query.geometry = sketchGeometry;
					query.distance = bufferSize;
					return sceneLayerView.queryObjectIds(query).then(highlightBuildings);
				}

				var yearChart = null;
				var materialChart = null;
				function queryStatistics() {
					const statDefinitions = [

					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'bijeenkomstfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "bijeenkomstfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'gezondheidszorgfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "gezondheidszorgfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'industriefunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "industriefunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'kantoorfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "kantoorfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'logiesfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "logiesfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'onderwijsfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "onderwijsfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'overige gebruiksfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "overige_gebruiksfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'sportfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "sportfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'winkelfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "winkelfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN Gebruiksdoel = 'woonfunctie' THEN 1 ELSE 0 END",
					outStatisticFieldName: "woonfunctie",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 1850 AND Bouwjaar <= 1899) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_1850",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 1900 AND Bouwjaar <= 1924) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_1900",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 1925 AND Bouwjaar <= 1949) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_1925",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 1950 AND Bouwjaar <= 1974) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_1950",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 1975 AND Bouwjaar <= 1999) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_1975",
					statisticType: "sum"
					},
					{
					onStatisticField:
					"CASE WHEN (Bouwjaar >= 2000 AND Bouwjaar <= 2015) THEN 1 ELSE 0 END",
					outStatisticFieldName: "year_2000",
					statisticType: "sum"
					}
				];
				const query = sceneLayerView.createQuery();
				query.geometry = sketchGeometry;
				query.distance = bufferSize;
				query.outStatistics = statDefinitions;
				return sceneLayerView.queryFeatures(query).then(function(result) {
					const allStats = result.features[0].attributes;
					updateChart(materialChart, [
						allStats.bijeenkomstfunctie,
						allStats.gezondheidszorgfunctie,
						allStats.industriefunctie,
						allStats.kantoorfunctie,
						allStats.logiesfunctie,
						allStats.onderwijsfunctie,
						allStats.overige_gebruiksfunctie,
						allStats.sportfunctie,
						allStats.winkelfunctie,
						allStats.woonfunctie,
					]);
					updateChart(yearChart, [
						allStats.year_1850,
						allStats.year_1900,
						allStats.year_1925,
						allStats.year_1950,
						allStats.year_1975,
						allStats.year_2000
					]);
				}, console.error);
				}

				// Updates the given chart with new data
				function updateChart(chart, dataValues) {
					chart.data.datasets[0].data = dataValues;
					chart.update();
				}

				function createYearChart() {
					const yearCanvas = document.getElementById("year-chart");
					yearChart = new Chart(yearCanvas.getContext("2d"), {
						type: "horizontalBar",
						data: {
							labels: [
								"1850-1899",
								"1900-1924",
								"1925-1949",
								"1950-1974",
								"1975-1999",
								"2000-2015"
							],
							datasets: [
								{
								label: "Build year",
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
							text: "Build year"
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

				function createMaterialChart() {
				const materialCanvas = document.getElementById("material-chart");
				materialChart = new Chart(materialCanvas.getContext("2d"), {
					type: "doughnut",
					data: {
						labels: ["Bijeenkomstfunctie", "Gezondheidszorgfunctie", "Industriefunctie", "Kantoorfunctie", "Logiesfunctie", "Onderwijsfunctie", "Overige gebruiksfunctie","Sportfunctie","Winkelfunctie", "woonfunctie"],
						datasets: [
						{
							backgroundColor: [
								"#00ffc5",
								"#e69800",
								"#b53535",
								"#8400a8",
								"#376cbd",
								"#e600a9",
								"#734c00",
								"#65A843",
								"#FFFF00",
								"#E1E1E1"
							],
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
							text: "Building Type"
						}
					}
				});
				}
				function clearCharts() {
					updateChart(materialChart, [0, 0, 0, 0, 0]);
					updateChart(yearChart, [0, 0, 0, 0, 0, 0]);
					document.getElementById("count").innerHTML = 0;
					}
					createYearChart();
					createMaterialChart();

					var canvas = document.getElementById("material-chart");
					var test_click_on_canvas = 0;
					canvas.onclick = function(evt) {
				      
				    var activePoints = materialChart.getElementsAtEvent(evt);
				    if (activePoints[0]) {
			        var chartData = activePoints[0]['_chart'].config.data;
			        var idx = activePoints[0]['_index'];

				    var label = chartData.labels[idx];
				    var value = chartData.datasets[0].data[idx];
				    console.log(label);
				    if (test_click_on_canvas == 0){
				      	test_click_on_canvas = 1;

				        sceneLayer.definitionExpression = "Gebruiksdoel LIKE '" + label.toLowerCase() + "'";
				    }
				        	
				      	
				    else{
				        test_click_on_canvas = 0
				      	sceneLayer.definitionExpression = "1 = 1";
				    }

					};
					}

				});

				
      				