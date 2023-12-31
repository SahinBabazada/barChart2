"use strict";

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;
import powerbi from "powerbi-visuals-api";
import Fill = powerbi.Fill;

export class VisualSettings extends DataViewObjectsParser {
  // public dataPoint: dataPointSettings = new dataPointSettings();
  public barchartProperties: BarchartProperties = new BarchartProperties();
  public dataLabel: DataLabel = new DataLabel();
}

export class BarchartProperties {
  sortBySize: boolean = true;
  xAxisFontSize: number = 10;
  yAxisFontSize: number = 10;
  yAxisEnable: boolean = true;
  positiveBarColor: Fill = { "solid": { "color": "#40916C" } }; // default color is  teal;
  negativeBarColor: Fill = { "solid": { "color": "#EF233C" } }; // default color is  green;
  defaultBarColor: Fill = { "solid": { "color": "#83C5BE" } }; // default color is  teal;
  opacity: number = 100;
}

export class DataLabel {
  displayUnit: number = 0;
  fontSize: number = 16;
  decimal: number = 1;
  color: Fill = { "solid": { "color": "#000000" } }; // default color is black;
}