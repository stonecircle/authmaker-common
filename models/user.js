var Q = require('q');
var _ = require('lodash');
var mongoose = require('mongoose');
var url = require('url');

var modelName = 'User';

var userSchema = new mongoose.Schema({

    /**
     * Unique key
     */
    username: String, //unique (per clientId) - required (was email in mysql)
    clientId: String, //clientId that was used to create the user

    /**
     * User Supplied fields
     */
    displayName: String, //not unique - optional => composed when not supplied (was username in mysql)
    email: String,
    password: String,

    //Install details - temporary during first install for an account
    websiteUrl: String,
    offlineEmail: String,

    /**
     * Automatically generated
     */
    status: String,
    createdAt: Date,
    lastLogin: Date,
    updatedAt: Date,
    activated: Boolean,
    isAuthmakerAdmin: Boolean,

    // 'Snapshot-able' data that can change regularly, is updated to
    // reflect latest state when chats are started
    lastKnownInformation: {
        timezone: String,
        localTime: String,
        browser: String,
        device: String,
        location: String,
        os: String
    },
    loggedIn: Boolean,
    avatarUrl: String,
    passwordResetHash: String,
    activationHash: String,

    preferences: {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            default: new mongoose.Types.ObjectId()
        },
        tabNotify: {
            type: Boolean,
            default: false
        },
        soundNotify: {
            type: Boolean,
            default: true
        },
        chromeNotify: {
            type: Boolean,
            default: false
        }
    },

    sentEmails: [{
        timestamp: Date,
        to: String,
        subject: String,
        message: String,
        reference: String
    }],

    externalIdentities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExternalIdentity' }]

}, {
    collection: 'users'
});

userSchema.index({
    user_id: 1
});

userSchema.index({
    mysqlId: 1
});

userSchema.index({
    username: 1
});

userSchema.index({
    username: 1,
    clientId: 1
}, {
    unique: true
});

userSchema.statics.findFirstRegisteredUserForConfig = function(configId) {
    return this
        .find({
            _config: configId
        })
        .sort({
            createdAt: 1
        })
        .limit(1)
        .exec()
        .then(function(users) {
            return users.length > 0 ? users[0] : null;
        });
};

userSchema.methods.getAccounts = function() {
    //return a (promise for) list of accounts that this user is a part of
    return this.model('Account').find({
        users: this._id
    }).populate('plan').exec().then(function(accounts){
        var promises = accounts.map(function(account){
            return account.plan.populate('scopes').execPopulate().then(function(){
                return account;
            });
        });

        return Q.all(promises);
    });
};

userSchema.methods.getActiveScopes = function() {
    return this.getAccounts().then(function(accounts) {
        return _(accounts)
            .chain()
            .filter(function(plan) {
                return plan.planExpiryDate > new Date();
            })
            .pluck('plan')
            .pluck('scopes')
            .flatten()
            .pluck('scope')
            .uniq()
            .value();
    });
};

userSchema.virtual('cleanUrl').get(function() {
    return clean_url(this.websiteUrl);
});

userSchema.path('websiteUrl').set(function(newVal) {
    //if it changes the clean url
    if (clean_url(this.websiteUrl) !== clean_url(newVal)) {
        //nullify the config so they have to re-verify it
        this._config = null;
    }
    return newVal;
});

//helper functions
function clean_url(toClean) {
    if (!toClean) {
        return;
    }
    return url.parse(toClean.toLowerCase(), true).host.replace('www.', '');
}

//protect against re-defining
if (mongoose.modelNames().indexOf(modelName) !== -1) {
    module.exports.modelObject = mongoose.model(modelName);
} else {
    module.exports.modelObject = mongoose.model(modelName, userSchema);
}
