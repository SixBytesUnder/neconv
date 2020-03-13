module.exports = {
	"env": {
		"es6": true,
		"node": true
	},
	"extends": "airbnb-base",
	"rules": {
		"indent": [2, "tab", { "SwitchCase": 1, "VariableDeclarator": 1 }],
		"no-tabs": 0,
		"linebreak-style": ["error", "windows"],
		"no-console": "off",
		"quotes": ["error", "single"],
		"semi": ["error", "always"],
		"comma-dangle": ["error", "never"],
		"arrow-body-style": ["error", "always"]
	}
};
