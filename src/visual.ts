import "./../style/visual.less";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

import DataView = powerbi.DataView;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import DataViewCategorical = powerbi.DataViewCategorical;
import DataViewCategoricalColumn = powerbi.DataViewCategoricalColumn;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import PrimitiveValue = powerbi.PrimitiveValue;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

import IColorPalette = powerbi.extensibility.IColorPalette;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import Fill = powerbi.Fill;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

import { valueFormatter as vf, textMeasurementService as tms } from "powerbi-visuals-utils-formattingutils";
import { createTooltipServiceWrapper, ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";

import IValueFormatter = vf.IValueFormatter;

import { VisualSettings, BarchartProperties, DataLabel } from "./settings";

import * as d3 from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;
type DataSelection<T> = d3.Selection<d3.BaseType, T, any, any>;

export interface BarchartDataPoint {
    category: string;
    actual: number;
    budget: number;
    selectionId: ISelectionId;
}

export interface BarchartViewModel {
    IsNotValid: boolean;
    DataPoints?: BarchartDataPoint[];
    Format?: string,
    SortBySize?: boolean;
    yAxisEnable?: boolean;
    XAxisFontSize?: number;
    YAxisFontSize?: number;
    defaultBarColor?: string;
    positiveBarColor?: string;
    negativeBarColor?: string;
    dataLabelSize?: number;
    dataDisplayUnit?: number;
    dataDecimal?: number;
    ColumnName?: string;
    MeasureName?: string;
}

export class BarChart implements IVisual {
    private svg: Selection<any>;
    private barContainer: Selection<SVGGElement>;



    private actualBarSelection: DataSelection<BarchartDataPoint>;
    private varianceBarSelection: DataSelection<BarchartDataPoint>;

    private actualDataLabel: DataSelection<BarchartDataPoint>;
    private varianceDataLabel: DataSelection<BarchartDataPoint>;
    private varianceDataLabel2: DataSelection<BarchartDataPoint>;

    private xAxisContainer: Selection<SVGGElement>;
    private yAxisContainer: Selection<SVGGElement>;
    private connections: Selection<SVGGElement>;

    private selectionManager: ISelectionManager;
    private tooltipServiceWrapper?: ITooltipServiceWrapper;

    private hostService: IVisualHost;

    private settings: VisualSettings;

    private viewModel: BarchartViewModel;
    private BarchartDataPoint: BarchartDataPoint[];

    private clickedBars: number[] = [];


    private static margin = {
        top: 20,
        right: 20,
        bottom: 20,
        left: 50,
    };

    static Config = {
        xScalePadding: 0.1,
        solidOpacity: 1,
        transparentOpacity: 0.4,
        xAxisFontMultiplier: 0.04,
    };


    constructor(options: VisualConstructorOptions) {
        this.hostService = options.host;
        this.selectionManager = this.hostService.createSelectionManager();
        options.element.style.overflowX = 'auto';

        this.selectionManager.registerOnSelectCallback(() => {
            this.syncSelectionState(this.actualBarSelection, <ISelectionId[]>this.selectionManager.getSelectionIds());
        });

        this.tooltipServiceWrapper = createTooltipServiceWrapper(this.hostService.tooltipService, options.element);

        this.svg = d3.select(options.element)
            .append('svg')
            .classed('Barchart', true);

        this.barContainer = this.svg
            .append('g')
            .classed('barContainer', true);

        this.xAxisContainer = this.svg
            .append('g')
            .classed('xAxis', true);

        this.connections = this.barContainer.append('g').classed('connection', true);

        this.yAxisContainer = this.svg
            .append('g')
            .classed('yAxis', true);

        this.settings = VisualSettings.getDefault() as VisualSettings;

    }

    public update(options: VisualUpdateOptions) {

        var viewModel: BarchartViewModel = this.createViewModel(options.dataViews[0]);
        if (viewModel.IsNotValid) {
            return;
        }

        var dynamicWidth;
        //set height and width of root SVG element using viewport passed by Power BI host
        this.svg.attr("height", options.viewport.height);


        let marginLeftValue = (viewModel.yAxisEnable == true) ? BarChart.margin.left : BarChart.margin.left - 30;
        let marginLeft = marginLeftValue * (viewModel.YAxisFontSize / 10);
        let marginBottom = BarChart.margin.bottom * (viewModel.XAxisFontSize / 10);
        let marginTop = BarChart.margin.top + 40;
        let marginRight = BarChart.margin.right;
        let categoryCount = viewModel.DataPoints.length;

        if (options.viewport.width < 300 && categoryCount > 3) {
            dynamicWidth = 300;
        }
        else {
            dynamicWidth = options.viewport.width;
        }

        this.svg.attr("width", dynamicWidth);

        // if (options.viewport.width  < 200){
        //     d3.select("#sandbox-host").style("overflow-x", "auto");
        //     marginBottom = marginBottom + 20;
        // }else{
        //     d3.select("#sandbox-host").style("overflow-x", null);
        // }

        let plotArea = {
            x: marginLeft,
            y: marginTop,
            width: (dynamicWidth - (marginLeft + marginRight)),
            height: (options.viewport.height - (marginTop + marginBottom + 5)),
        };



        this.barContainer
            .attr("transform", "translate(" + plotArea.x + "," + plotArea.y + ")")
            .attr("width", options.viewport.width)
            .attr("height", options.viewport.height);

        var xScale = d3.scaleBand()
            .rangeRound([0, plotArea.width])
            .padding(0.1)
            .domain(viewModel.DataPoints.map((dataPoint: BarchartDataPoint) => dataPoint.category));

        this.xAxisContainer
            .attr("class", "xAxis")
            .attr("transform", "translate(" + plotArea.x + "," + (plotArea.height + plotArea.y) + ")")
            .call(d3.axisBottom(xScale).tickSizeOuter(0));

        d3.select(".xAxis").selectAll("text").style("font-size", viewModel.XAxisFontSize);

        let maxValueY: number = d3.max(
            viewModel.DataPoints,
            (dataPoint: BarchartDataPoint) =>
                /** Get the higher of either measure per group */
                + Math.max(dataPoint.actual, dataPoint.budget)
        );

        var valueFormatter = vf.create({
            format: viewModel.Format,
            value: maxValueY / 100,
            cultureSelector: this.hostService.locale
        });

        var yScale = d3.scaleLinear()
            .rangeRound([plotArea.height, 0])
            .domain([0, maxValueY * 1.02]);


        var yAxis = d3.axisLeft(yScale)
            .tickFormat((d) => valueFormatter.format(d));

        this.yAxisContainer
            .attr("class", "yAxis")
            .attr("transform", "translate(" + plotArea.x + "," + plotArea.y + ")")
            .call(yAxis)
            .attr('display', () => (viewModel.yAxisEnable) ? "" : "None");


        d3.select(".yAxis").selectAll("text").style("font-size", viewModel.YAxisFontSize);


        this.actualBarSelection = this.barContainer
            .selectAll('.actualBar')
            .data(viewModel.DataPoints);

        this.varianceBarSelection = this.barContainer
            .selectAll('.varianceBar')
            .data(viewModel.DataPoints);


        this.actualDataLabel = this.barContainer
            .selectAll('.actual-bar-label')
            .data(viewModel.DataPoints);

        this.varianceDataLabel = this.barContainer
            .selectAll('.variance-bar-label')
            .data(viewModel.DataPoints);

        this.varianceDataLabel2 = this.barContainer
            .selectAll('.variance-bar-label2')
            .data(viewModel.DataPoints);

        this.connections = this.barContainer.selectAll('connection');

        const varianceBarMerged = this.varianceBarSelection
            .enter()
            .append('rect')
            .merge(<any>this.varianceBarSelection)
            .classed('varianceBar', true)
            .attr("id", (dataPoint: BarchartDataPoint, i) => "vbar" + i);
        const actualBarMerged = this.actualBarSelection
            .enter()
            .append('rect')
            .merge(<any>this.actualBarSelection)
            .classed('actualBar', true)
            .attr("id", (dataPoint: BarchartDataPoint, i) => "bar" + i);

        console.log(viewModel.dataDisplayUnit);

        this.actualDataLabel
            .enter()
            .append('text')
            .merge(<any>this.actualDataLabel)
            .classed('actual-bar-label', true)
            .attr('x', (dataPoint: BarchartDataPoint) => xScale(dataPoint.category) + xScale.bandwidth() / 2)
            .attr('dx', 0)
            .attr('y', (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) - 20 : yScale(Number(dataPoint.budget)) - 20)
            .attr('dy', -6)
            .attr("font-size", `${viewModel.dataLabelSize}px`)
            .text((dataPoint: BarchartDataPoint) => this.dataUnits(viewModel.dataDisplayUnit, dataPoint.actual, viewModel.dataDecimal));

        this.varianceDataLabel
            .enter()
            .append('text')
            .merge(<any>this.varianceDataLabel)
            .classed('variance-bar-label', true)
            .attr('x', (dataPoint: BarchartDataPoint) => xScale(dataPoint.category) + xScale.bandwidth() / 2)
            .attr('dx', 0)
            .attr('y', (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) - 5 : yScale(Number(dataPoint.budget)) - 5)
            .attr('dy', -6)
            .text((dataPoint: BarchartDataPoint) => `${((dataPoint.actual - dataPoint.budget) / dataPoint.budget * 100).toFixed(1)}%`);


        actualBarMerged
            .attr("x", (dataPoint: BarchartDataPoint) => xScale(dataPoint.category))
            .attr("y", (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.budget)) : yScale(Number(dataPoint.actual)))
            .attr("width", xScale.bandwidth())
            .attr("height", (dataPoint: BarchartDataPoint) => (plotArea.height - (dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.budget)) : yScale(Number(dataPoint.actual)))))
            .style("fill", (dataPoint: BarchartDataPoint) => viewModel.defaultBarColor)
            .style("fill-opacity", (dataPoint: BarchartDataPoint) => 1);

        varianceBarMerged
            .attr("x", (dataPoint: BarchartDataPoint) => xScale(dataPoint.category))
            .attr("y", (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) : yScale(Number(dataPoint.budget)))
            .attr("width", xScale.bandwidth())
            .attr("height", (dataPoint: BarchartDataPoint) => (plotArea.height - (dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) : yScale(Number(dataPoint.budget)))))
            .style("fill", (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? viewModel.negativeBarColor : viewModel.positiveBarColor);





        // create connections

        // Set up the click and double-click handlers
        // actualBarMerged.on('click', (d, i, n) => {
        //     this.handleBarClick(d, i, n)
        // });

        actualBarMerged.on('mouseenter', (data, i) => {
            d3.selectAll('.variance-bar-label')
                .attr('opacity', 0)

            const y = (data.actual > data.budget) ? yScale(Number(data.actual)) : yScale(Number(data.budget));
            const width = plotArea.width;
            this.addLine(y, width);


            this.varianceDataLabel2.enter()
                .append('text')
                .attr('class', 'divergence')
                .attr('x', (dataPoint: BarchartDataPoint) => xScale(dataPoint.category) + xScale.bandwidth() / 2)
                .attr('dx', 0)
                .attr('y', (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) - 5 : yScale(Number(dataPoint.budget)) - 5)
                .attr('dy', -6)
                .text((dataPoint: BarchartDataPoint, idx) => {
                    const divergence = ((dataPoint.actual - data.actual) / data.actual).toFixed(2);

                    let text = ''
                    if (Number(divergence) > 0) text += '+'
                    text += `${divergence}%`

                    return idx !== i ? text : '';
                })

        }).on('mouseleave', () => {
            d3.selectAll('.variance-bar-label')
                .attr('opacity', 1)

            this.svg.selectAll('#limit').remove()
            this.svg.selectAll('.divergence').remove()
            this.varianceDataLabel.exit();
        })


        varianceBarMerged.on('mouseenter', (data, i) => {
            d3.selectAll('.variance-bar-label')
                .attr('opacity', 0)

            const y = (data.actual > data.budget) ? yScale(Number(data.actual)) : yScale(Number(data.budget));
            const width = plotArea.width;
            this.addLine(y, width);


            this.varianceDataLabel2.enter()
                .append('text')
                .attr('class', 'divergence')
                .attr('x', (dataPoint: BarchartDataPoint) => xScale(dataPoint.category) + xScale.bandwidth() / 2)
                .attr('dx', 0)
                .attr('y', (dataPoint: BarchartDataPoint) => dataPoint.actual > dataPoint.budget ? yScale(Number(dataPoint.actual)) - 5 : yScale(Number(dataPoint.budget)) - 5)
                .attr('dy', -6)
                .text((dataPoint: BarchartDataPoint, idx) => {
                    const divergence = ((dataPoint.actual - data.actual) / data.actual).toFixed(2);

                    let text = ''
                    if (Number(divergence) > 0) text += '+'
                    text += `${divergence}%`

                    return idx !== i ? text : '';
                })

        }).on('mouseleave', () => {
            d3.selectAll('.variance-bar-label')
                .attr('opacity', 1)

            this.svg.selectAll('#limit').remove()
            this.svg.selectAll('.divergence').remove()
            this.varianceDataLabel.exit();
        })
















        this.tooltipServiceWrapper.addTooltip(actualBarMerged,
            (dataPoint: BarchartDataPoint) => this.getTooltipData(dataPoint),
            (dataPoint: BarchartDataPoint) => dataPoint.selectionId
        );
        this.tooltipServiceWrapper.addTooltip(varianceBarMerged,
            (dataPoint: BarchartDataPoint) => this.getTooltipData(dataPoint),
            (dataPoint: BarchartDataPoint) => dataPoint.selectionId
        );


        this.syncSelectionState(
            actualBarMerged,
            <ISelectionId[]>this.selectionManager.getSelectionIds()
        );
        // this.syncSelectionState(
        //     barSelectionMerged2,
        //     <ISelectionId[]>this.selectionManager.getSelectionIds()
        // );


        this.actualDataLabel
            .exit()
            .remove();
        this.varianceDataLabel
            .exit()
            .remove();
        this.actualBarSelection
            .exit()
            .remove();
        this.varianceBarSelection
            .exit()
            .remove();

    }

    // private getTooltipDataBudget(value: any): VisualTooltipDataItem[] {
    //     console.log(value);
    //     return [{
    //         displayName: value.category,
    //         value: value.budget.toString()
    //     }];
    // }

    private getTooltipData(value: any): VisualTooltipDataItem[] {
        return [{
            displayName: `actual:`,
            value: value.actual.toString()
        }, {
            displayName: `budget:`,
            value: value.budget.toString()
        }];
    }

    private addLine(y, width) {
        this.barContainer.append('line')
            .attr('id', 'limit')
            .attr('x1', 0)
            .attr('y1', y)
            .attr('x2', width)
            .attr('y2', y)
    }

    private dataUnits(x, y, decimal) {
        let result;

        switch (x) {
            case 1000:
                result = `${(y / 1000).toFixed(decimal)}K`;
                break;
            case 1000000:
                result = `${(y / 1000000).toFixed(decimal)}M`;
                break;
            case 1000000000:
                result = `${(y / 1000000000).toFixed(decimal)}bn`;
                break;
            case 1000000000000:
                result = `${(y / 1000000000000).toFixed(decimal)}T`;
                break;
            case 1:
                result = `${(y / 1).toFixed(decimal)}`;
                break;
            default:
                result = `${y.toFixed(decimal)}`;
                break;
        }

        return result;
    }
    // private handleBarClick(d, i: number, n) {
    //     const clickedBar = n[i];
    //     if (this.clickedBars.length === 0) {
    //         this.clickedBars.push(i);
    //     } else {

    //         const firstBar = this.clickedBars[0];

    //         const x1 = Number(d3.select(clickedBar).attr('x'));
    //         const x2 = Number(d3.select(n[firstBar]).attr('x'));

    //         const y1 = Number(d3.select(clickedBar).attr('y'));
    //         const y2 = Number(d3.select(n[firstBar]).attr('y')) + Number(d3.select(n[firstBar]).attr('height'));

    //         const w1 = Number(d3.select(clickedBar).attr('width'));
    //         const w2 = Number(d3.select(n[firstBar]).attr('width'));

    //         let firstValue = d3.select(n[firstBar])['_groups'][0][0]['__data__']['actual'];
    //         let secondValue = d3.select(clickedBar)['_groups'][0][0]['__data__']['actual'];

    //         let minY = Math.min(y1, y2);



    //         this.connections.append('path')
    //             .attr('d', `M ${x2 + w2/2}, ${y2 - 40} V ${minY - 40} H ${x1 + w1/2} V ${y1 - 20}`)
    //             .attr('stroke', 'black')
    //             .attr('fill', 'none');

    //         this.connections.append('rect')
    //             .attr('x', (x1 + x2)/2)
    //             .attr('y', minY - 50)
    //             .attr('width', 50)
    //             .attr('height', 20)
    //             .attr('rx', 10)
    //             .style('stroke', 'gray')
    //             .style('fill', 'white');

    //         let text_content =   `${secondValue > firstValue ? '+' : ''}${Math.round((secondValue / firstValue * 100) - 100)}%`

    //         this.connections.append('text')
    //             .text(text_content)
    //             .attr('class', 'mark_class')
    //             .attr('x',  (x1 + x2)/2 + 15)
    //             .attr('y', minY - 37)
    //             .attr('text-anchor', 'middle')
    //             .style('fill', 'black')


    //         this.clickedBars = [];
    //     }
    // }

    public createViewModel(dataView: DataView): BarchartViewModel {

        //handle case where categorical DataView is not valid
        if (typeof dataView === "undefined" ||
            typeof dataView.categorical === "undefined" ||
            typeof dataView.categorical.categories === "undefined" ||
            typeof dataView.categorical.values === "undefined") {
            return { IsNotValid: true };
        }

        this.settings = VisualSettings.parse(dataView) as VisualSettings;

        var categoricalDataView: DataViewCategorical = dataView.categorical;
        var categoryColumn: DataViewCategoricalColumn = categoricalDataView.categories[0];
        var categoryNames: PrimitiveValue[] = categoricalDataView.categories[0].values;
        var categoryValues: PrimitiveValue[] = categoricalDataView.values[0].values;

        var BarchartDataPoints: BarchartDataPoint[] = [];


        let category = dataView.categorical.categories[0];
        let dataValue = dataView.categorical.values[0];
        /** Iterate over the category values and push into the view model data points.
         *  The index is the same across categories and measures.
         *      actual = values[0]
         *      budget = values[1]
         */


        // categoryNames.map((c, ci) => { /** c= category, ci = category array index */
        //     BarchartDataPoints.push({
        //         category: <string>c,
        //         actual: <number>categoricalDataView.values[0].values[ci],
        //         budget: <number>categoricalDataView.values[1].values[ci]
        //     });
        // });

        for (let i = 0, len = Math.max(category.values.length, dataValue.values.length); i < len; i++) {

            const selectionId: ISelectionId = this.hostService.createSelectionIdBuilder()
                .withCategory(category, i)
                .createSelectionId();

            BarchartDataPoints.push({
                category: <string>category.values[i],
                actual: <number>categoricalDataView.values[0].values[i],
                budget: <number>categoricalDataView.values[1].values[i],
                selectionId,
            });
        }



        //get formatting code for the field that is the measure
        var format: string = categoricalDataView.values[0].source.format

        //get persistent property values
        var SortBySize: boolean = this.settings.barchartProperties.sortBySize;
        var yAxisEnable: boolean = this.settings.barchartProperties.yAxisEnable;
        var xAxisFontSize: number = this.settings.barchartProperties.xAxisFontSize;
        var yAxisFontSize: number = this.settings.barchartProperties.yAxisFontSize;
        var positiveBarColor: string = typeof (this.settings.barchartProperties.positiveBarColor) == "string" ?
            this.settings.barchartProperties.positiveBarColor :
            this.settings.barchartProperties.positiveBarColor.solid.color;
        var negativeBarColor: string = typeof (this.settings.barchartProperties.negativeBarColor) == "string" ?
            this.settings.barchartProperties.negativeBarColor :
            this.settings.barchartProperties.negativeBarColor.solid.color;
        var defaultBarColor: string = typeof (this.settings.barchartProperties.defaultBarColor) == "string" ?
            this.settings.barchartProperties.defaultBarColor :
            this.settings.barchartProperties.defaultBarColor.solid.color;


        var dataLabelSize: number = this.settings.dataLabel.fontSize;
        var dataDisplayUnit: number = this.settings.dataLabel.displayUnit;
        var dataDecimal: number = this.settings.dataLabel.decimal;

        //sort dataset rows by measure value instead of cateogry value
        if (SortBySize) {
            BarchartDataPoints.sort((x, y) => { return y.actual - x.actual })
        }

        //return view model to upate method
        return {
            IsNotValid: false,
            DataPoints: BarchartDataPoints,
            Format: format,
            SortBySize: SortBySize,
            yAxisEnable: yAxisEnable,
            defaultBarColor: defaultBarColor,
            positiveBarColor: positiveBarColor,
            negativeBarColor: negativeBarColor,
            XAxisFontSize: xAxisFontSize,
            YAxisFontSize: yAxisFontSize,
            dataLabelSize: dataLabelSize,
            dataDisplayUnit: dataDisplayUnit,
            dataDecimal: dataDecimal,
            ColumnName: dataView.metadata.columns[1].displayName,
            MeasureName: dataView.metadata.columns[0].displayName
        };

    }
    private syncSelectionState(selection, selectionIds): void {
        if (!selection || !selectionIds) {
            return;
        }

        if (!selectionIds.length) {
            const opacity: number = this.settings.barchartProperties.opacity / 100;
            selection
                .style("fill-opacity", opacity)
                .style("stroke-opacity", opacity);
            return;
        }

        const self: this = this;

        selection.each(function (barDataPoint) {
            const isSelected: boolean = self.isSelectionIdInArray(selectionIds, barDataPoint.selectionId);

            const opacity: number = isSelected
                ? BarChart.Config.solidOpacity
                : BarChart.Config.transparentOpacity;

            d3.select(this)
                .style("fill-opacity", opacity)
                .style("stroke-opacity", opacity);
        });
    }

    private isSelectionIdInArray(selectionIds: ISelectionId[], selectionId: ISelectionId): boolean {
        if (!selectionIds || !selectionId) {
            return false;
        }

        return selectionIds.some((currentSelectionId: ISelectionId) => {
            return currentSelectionId.includes(selectionId);
        });
    }

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {

        var visualObjects: VisualObjectInstanceEnumerationObject = <VisualObjectInstanceEnumerationObject>VisualSettings.enumerateObjectInstances(this.settings, options);

        visualObjects.instances[0].validValues = {
            xAxisFontSize: { numberRange: { min: 8, max: 36 } },
            yAxisFontSize: { numberRange: { min: 8, max: 36 } },
        };

        return visualObjects
    }

}