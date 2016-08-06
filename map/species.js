var RuleSet = require('./ruleset');
var SpeciesMask = require('./species-mask');

module.exports = Species = function(params) {
    this.id = params.id || 'species' + Math.floor(Math.random()*1e8);

    // behavior
    // TODO: fix passable for phaser
    this.passable = params.hasOwnProperty('passable') ? params.passable : true;

    if (params.hasOwnProperty('speed')) {
        this.speed = params.speed;
    }

    if (params.hasOwnProperty('timeToIteration')) {
        this.timeToIteration = params.timeToIteration;
    }

    if (params.hasOwnProperty('forceNeighborIteration')) {
        this.forceNeighborIteration = params.forceNeighborIteration;
    }

    this.initRules(params.rules);

    //this.ruleSet = new RuleSet(params.rules);

    // This is a function to decide whether a cell hosts this species or not
    this.mask = SpeciesMask(this.id);
}

Species.prototype = {};

// this is sort of messy; it populates stuff in the rules object
Species.prototype.initRules = function(rules) {
    this.rules = rules || {};

    // The default rules govern how the species spreads based on its own presence
    this.rules.default = new RuleSet(this.rules.default)   

    // Ruts are like conditionals, but semantically different
    this.rules.ruts = this.rules.ruts || [];
    this.rules.ruts.forEach(function(rut) {
        rut.rules = new RuleSet(rut.rules);
    })

    // Conditional rules are based on other species
    this.rules.conditional = this.rules.conditional || [];

    this.rules.conditional.forEach(function(condition) {
        condition.mask = SpeciesMask(condition.species_id);
        condition.rules = new RuleSet(condition.rules);
    })
}

Species.prototype.getSymbol = function() { return this.symbol; }
Species.prototype.getColor = function() { return this.color; }

// Returns 1 or 0, depending on whether the next iteration should include this species
Species.prototype.nextState = function(cell, neighbors) {
    // turn these things into arrays of 1s and 0s (or whatever)
    var self = this;

    // these are the rules to use.
    var ruleset = this.decideRuleset(cell, neighbors)
    
    // these are masked by THIS species, not a foreign species returned by decideRuleset
    var maskedCell = this.mask(cell);
    var maskedNeighbors = mapCoordmap(neighbors, self.mask);

    var nextState = ruleset.transform(maskedCell, maskedNeighbors);

    // propagate age (this will only be used if nextState is 1)
    // TODO: make a way to compose things together (like self.mask and cell.getAge)
    var maskedAges = mapCoordmap(neighbors, function(cell) { return !!cell ? self.mask(cell) * cell.getAge() : 0 });
    var age = Math.ceil(coordmapAvg(maskedAges));

    var iterationTime = Settings.mapIterationTimeout;
    if (ruleset.hasOwnProperty('iterationTime')) {
        iterationTime = ruleset.iterationTime;
    }
    
    return {state: nextState, age: age, iterationTime: iterationTime};
}


Species.prototype.decideRuleset = function(cell, neighbors) {
    var winningRuleset = this.rules.default;

    if (this.rules.conditional.length + this.rules.ruts.length === 0)
        return winningRuleset;

    // RUTS
    // If a rut is present, it can override other stuff
    // - should be sorted from HIGHEST priority to lowest.
    for (var i = 0; i < this.rules.ruts.length; i++) {
        // The probability that this rut ends up affecting the cell
        // is proportional to its intensity (0 to 1)
        // TODO: this needs testing
        var rut = this.rules.ruts[i];
        var intensity = cell.ruts[rut.rut_id];
        if (!intensity || Math.random() > intensity) continue;

        winningRuleset = rut.rules;
        return winningRuleset;
    }

    // CONDITIONAL RULES
    // - should be sorted from lowest priority to highest.

    this.rules.conditional.forEach(function(condition) {
        var maskedNeighbors = mapCoordmap(neighbors, condition.mask);
        var count = coordmapSum(maskedNeighbors);

        // the number of neighbors has to meet the neighbor threshhold
        if (condition.min_neighbors && count < condition.min_neighbors) return;

        // the cell age has to meet the age threshhold
        if (condition.min_age && cell.getAge() < condition.min_age) return;

        winningRuleset = condition.rules;
    })


    return winningRuleset;
}

Species.prototype.getIterationTime = function() {
    return this.timeToIteration || Settings.mapIterationTimeout;    
}

// TODO make a coordmap object type...
function mapCoordmap(coordmap, mapFunction) {
    return coordmap.map(function(coordmapItem) {
        return {coords: coordmapItem.coords, value: mapFunction(coordmapItem.value)};
    })
}

function coordmapSum(coordmap) {
    var sum = 0
    coordmap.forEach(function(coordmapItem) {
        sum += coordmapItem.value;
    })
    return sum;
}

function coordmapAvg(coordmap) {
    return coordmapSum(coordmap) / coordmap.length;
}
