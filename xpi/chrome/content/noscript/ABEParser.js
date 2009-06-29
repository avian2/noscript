// $ANTLR 3.1.1 ABE.g 2009-02-04 00:43:45

var ABEParser = function(input, state) {
    if (!state) {
        state = new org.antlr.runtime.RecognizerSharedState();
    }

    (function(){
    }).call(this);

    ABEParser.superclass.constructor.call(this, input, state);


         

    /* @todo only create adaptor if output=AST */
    this.adaptor = new org.antlr.runtime.tree.CommonTreeAdaptor();

};

org.antlr.lang.augmentObject(ABEParser, {
    T_FROM: 9,
    HTTPVERB: 7,
    GLOB: 12,
    A_LOGOUT: 16,
    A_DENY: 15,
    T_ACTION: 4,
    SUB: 8,
    T_METHODS: 5,
    EOF: -1,
    URI: 13,
    WS: 22,
    URI_PART: 20,
    A_SANDBOX: 17,
    URI_START: 19,
    ALL: 6,
    A_ACCEPT: 18,
    REGEXP: 11,
    LOCATION: 14,
    T_SITE: 10,
    COMMENT: 23,
    LIST_SEP: 21
});

(function(){
// public class variables
var T_FROM= 9,
    HTTPVERB= 7,
    GLOB= 12,
    A_LOGOUT= 16,
    A_DENY= 15,
    T_ACTION= 4,
    SUB= 8,
    T_METHODS= 5,
    EOF= -1,
    URI= 13,
    WS= 22,
    URI_PART= 20,
    A_SANDBOX= 17,
    URI_START= 19,
    ALL= 6,
    A_ACCEPT= 18,
    REGEXP= 11,
    LOCATION= 14,
    T_SITE= 10,
    COMMENT= 23,
    LIST_SEP= 21;

// public instance methods/vars
org.antlr.lang.extend(ABEParser, org.antlr.runtime.Parser, {
        
    setTreeAdaptor: function(adaptor) {
        this.adaptor = adaptor;
    },
    getTreeAdaptor: function() {
        return this.adaptor;
    },

    getTokenNames: function() { return ABEParser.tokenNames; },
    getGrammarFileName: function() { return "ABE.g"; }
});
org.antlr.lang.augmentObject(ABEParser.prototype, {

    // inline static return class
    ruleset_return: (function() {
        ABEParser.ruleset_return = function(){};
        org.antlr.lang.extend(ABEParser.ruleset_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:13:1: ruleset : ( rule )* EOF ;
    // $ANTLR start "ruleset"
    ruleset: function() {
        var retval = new ABEParser.ruleset_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var EOF2 = null;
         var rule1 = null;

        var EOF2_tree=null;

        try {
            // ABE.g:13:11: ( ( rule )* EOF )
            // ABE.g:13:13: ( rule )* EOF
            root_0 = this.adaptor.nil();

            // ABE.g:13:13: ( rule )*
            loop1:
            do {
                var alt1=2;
                var LA1_0 = this.input.LA(1);

                if ( (LA1_0==T_SITE) ) {
                    alt1=1;
                }


                switch (alt1) {
                case 1 :
                    // ABE.g:13:13: rule
                    this.pushFollow(ABEParser.FOLLOW_rule_in_ruleset49);
                    rule1=this.rule();

                    this.state._fsp--;

                    this.adaptor.addChild(root_0, rule1.getTree());


                    break;

                default :
                    break loop1;
                }
            } while (true);

            EOF2=this.match(this.input,EOF,ABEParser.FOLLOW_EOF_in_ruleset52); 
            EOF2_tree = this.adaptor.create(EOF2);
            this.adaptor.addChild(root_0, EOF2_tree);




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    rule_return: (function() {
        ABEParser.rule_return = function(){};
        org.antlr.lang.extend(ABEParser.rule_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:15:1: rule : subject ( predicate )+ -> subject ( predicate )+ ;
    // $ANTLR start "rule"
    rule: function() {
        var retval = new ABEParser.rule_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

         var subject3 = null;
         var predicate4 = null;

        var stream_subject=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"rule subject");
        var stream_predicate=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"rule predicate");
        try {
            // ABE.g:15:11: ( subject ( predicate )+ -> subject ( predicate )+ )
            // ABE.g:15:13: subject ( predicate )+
            this.pushFollow(ABEParser.FOLLOW_subject_in_rule65);
            subject3=this.subject();

            this.state._fsp--;

            stream_subject.add(subject3.getTree());
            // ABE.g:15:21: ( predicate )+
            var cnt2=0;
            loop2:
            do {
                var alt2=2;
                var LA2_0 = this.input.LA(1);

                if ( ((LA2_0>=A_DENY && LA2_0<=A_ACCEPT)) ) {
                    alt2=1;
                }


                switch (alt2) {
                case 1 :
                    // ABE.g:15:21: predicate
                    this.pushFollow(ABEParser.FOLLOW_predicate_in_rule67);
                    predicate4=this.predicate();

                    this.state._fsp--;

                    stream_predicate.add(predicate4.getTree());


                    break;

                default :
                    if ( cnt2 >= 1 ) {
                        break loop2;
                    }
                        var eee = new org.antlr.runtime.EarlyExitException(2, this.input);
                        throw eee;
                }
                cnt2++;
            } while (true);



            // AST REWRITE
            // elements: subject, predicate
            // token labels: 
            // rule labels: retval
            // token list labels: 
            // rule list labels: 
            retval.tree = root_0;
            var stream_retval=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"token retval",retval!=null?retval.tree:null);

            root_0 = this.adaptor.nil();
            // 15:32: -> subject ( predicate )+
            {
                this.adaptor.addChild(root_0, stream_subject.nextTree());
                if ( !(stream_predicate.hasNext()) ) {
                    throw new org.antlr.runtime.tree.RewriteEarlyExitException();
                }
                while ( stream_predicate.hasNext() ) {
                    this.adaptor.addChild(root_0, stream_predicate.nextTree());

                }
                stream_predicate.reset();

            }

            retval.tree = root_0;


            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    predicate_return: (function() {
        ABEParser.predicate_return = function(){};
        org.antlr.lang.extend(ABEParser.predicate_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:17:1: predicate : action ( methods )? ( origin )? -> T_ACTION action T_METHODS ( methods )? ( origin )? ;
    // $ANTLR start "predicate"
    predicate: function() {
        var retval = new ABEParser.predicate_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

         var action5 = null;
         var methods6 = null;
         var origin7 = null;

        var stream_methods=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"rule methods");
        var stream_action=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"rule action");
        var stream_origin=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"rule origin");
        try {
            // ABE.g:17:11: ( action ( methods )? ( origin )? -> T_ACTION action T_METHODS ( methods )? ( origin )? )
            // ABE.g:17:13: action ( methods )? ( origin )?
            this.pushFollow(ABEParser.FOLLOW_action_in_predicate84);
            action5=this.action();

            this.state._fsp--;

            stream_action.add(action5.getTree());
            // ABE.g:17:20: ( methods )?
            var alt3=2;
            var LA3_0 = this.input.LA(1);

            if ( ((LA3_0>=ALL && LA3_0<=SUB)) ) {
                alt3=1;
            }
            switch (alt3) {
                case 1 :
                    // ABE.g:17:20: methods
                    this.pushFollow(ABEParser.FOLLOW_methods_in_predicate86);
                    methods6=this.methods();

                    this.state._fsp--;

                    stream_methods.add(methods6.getTree());


                    break;

            }

            // ABE.g:17:29: ( origin )?
            var alt4=2;
            var LA4_0 = this.input.LA(1);

            if ( (LA4_0==T_FROM) ) {
                alt4=1;
            }
            switch (alt4) {
                case 1 :
                    // ABE.g:17:29: origin
                    this.pushFollow(ABEParser.FOLLOW_origin_in_predicate89);
                    origin7=this.origin();

                    this.state._fsp--;

                    stream_origin.add(origin7.getTree());


                    break;

            }



            // AST REWRITE
            // elements: methods, origin, action
            // token labels: 
            // rule labels: retval
            // token list labels: 
            // rule list labels: 
            retval.tree = root_0;
            var stream_retval=new org.antlr.runtime.tree.RewriteRuleSubtreeStream(this.adaptor,"token retval",retval!=null?retval.tree:null);

            root_0 = this.adaptor.nil();
            // 17:37: -> T_ACTION action T_METHODS ( methods )? ( origin )?
            {
                this.adaptor.addChild(root_0, this.adaptor.create(T_ACTION, "T_ACTION"));
                this.adaptor.addChild(root_0, stream_action.nextTree());
                this.adaptor.addChild(root_0, this.adaptor.create(T_METHODS, "T_METHODS"));
                // ABE.g:17:66: ( methods )?
                if ( stream_methods.hasNext() ) {
                    this.adaptor.addChild(root_0, stream_methods.nextTree());

                }
                stream_methods.reset();
                // ABE.g:17:75: ( origin )?
                if ( stream_origin.hasNext() ) {
                    this.adaptor.addChild(root_0, stream_origin.nextTree());

                }
                stream_origin.reset();

            }

            retval.tree = root_0;


            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    methods_return: (function() {
        ABEParser.methods_return = function(){};
        org.antlr.lang.extend(ABEParser.methods_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:19:1: methods : ( ( method )+ | ALL ) ;
    // $ANTLR start "methods"
    methods: function() {
        var retval = new ABEParser.methods_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var ALL9 = null;
         var method8 = null;

        var ALL9_tree=null;

        try {
            // ABE.g:19:11: ( ( ( method )+ | ALL ) )
            // ABE.g:19:13: ( ( method )+ | ALL )
            root_0 = this.adaptor.nil();

            // ABE.g:19:13: ( ( method )+ | ALL )
            var alt6=2;
            var LA6_0 = this.input.LA(1);

            if ( ((LA6_0>=HTTPVERB && LA6_0<=SUB)) ) {
                alt6=1;
            }
            else if ( (LA6_0==ALL) ) {
                alt6=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 6, 0, this.input);

                throw nvae;
            }
            switch (alt6) {
                case 1 :
                    // ABE.g:19:14: ( method )+
                    // ABE.g:19:14: ( method )+
                    var cnt5=0;
                    loop5:
                    do {
                        var alt5=2;
                        var LA5_0 = this.input.LA(1);

                        if ( ((LA5_0>=HTTPVERB && LA5_0<=SUB)) ) {
                            alt5=1;
                        }


                        switch (alt5) {
                        case 1 :
                            // ABE.g:19:14: method
                            this.pushFollow(ABEParser.FOLLOW_method_in_methods115);
                            method8=this.method();

                            this.state._fsp--;

                            this.adaptor.addChild(root_0, method8.getTree());


                            break;

                        default :
                            if ( cnt5 >= 1 ) {
                                break loop5;
                            }
                                var eee = new org.antlr.runtime.EarlyExitException(5, this.input);
                                throw eee;
                        }
                        cnt5++;
                    } while (true);



                    break;
                case 2 :
                    // ABE.g:19:24: ALL
                    ALL9=this.match(this.input,ALL,ABEParser.FOLLOW_ALL_in_methods120); 
                    ALL9_tree = this.adaptor.create(ALL9);
                    this.adaptor.addChild(root_0, ALL9_tree);



                    break;

            }




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    method_return: (function() {
        ABEParser.method_return = function(){};
        org.antlr.lang.extend(ABEParser.method_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:21:1: method : ( HTTPVERB | SUB ) ;
    // $ANTLR start "method"
    method: function() {
        var retval = new ABEParser.method_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var set10 = null;

        var set10_tree=null;

        try {
            // ABE.g:21:11: ( ( HTTPVERB | SUB ) )
            // ABE.g:21:13: ( HTTPVERB | SUB )
            root_0 = this.adaptor.nil();

            set10=this.input.LT(1);
            if ( (this.input.LA(1)>=HTTPVERB && this.input.LA(1)<=SUB) ) {
                this.input.consume();
                this.adaptor.addChild(root_0, this.adaptor.create(set10));
                this.state.errorRecovery=false;
            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                throw mse;
            }




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    origin_return: (function() {
        ABEParser.origin_return = function(){};
        org.antlr.lang.extend(ABEParser.origin_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:23:1: origin : T_FROM resources ;
    // $ANTLR start "origin"
    origin: function() {
        var retval = new ABEParser.origin_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var T_FROM11 = null;
         var resources12 = null;

        var T_FROM11_tree=null;

        try {
            // ABE.g:23:11: ( T_FROM resources )
            // ABE.g:23:13: T_FROM resources
            root_0 = this.adaptor.nil();

            T_FROM11=this.match(this.input,T_FROM,ABEParser.FOLLOW_T_FROM_in_origin149); 
            T_FROM11_tree = this.adaptor.create(T_FROM11);
            this.adaptor.addChild(root_0, T_FROM11_tree);

            this.pushFollow(ABEParser.FOLLOW_resources_in_origin151);
            resources12=this.resources();

            this.state._fsp--;

            this.adaptor.addChild(root_0, resources12.getTree());



            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    subject_return: (function() {
        ABEParser.subject_return = function(){};
        org.antlr.lang.extend(ABEParser.subject_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:25:1: subject : T_SITE resources ;
    // $ANTLR start "subject"
    subject: function() {
        var retval = new ABEParser.subject_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var T_SITE13 = null;
         var resources14 = null;

        var T_SITE13_tree=null;

        try {
            // ABE.g:25:11: ( T_SITE resources )
            // ABE.g:25:13: T_SITE resources
            root_0 = this.adaptor.nil();

            T_SITE13=this.match(this.input,T_SITE,ABEParser.FOLLOW_T_SITE_in_subject162); 
            T_SITE13_tree = this.adaptor.create(T_SITE13);
            this.adaptor.addChild(root_0, T_SITE13_tree);

            this.pushFollow(ABEParser.FOLLOW_resources_in_subject164);
            resources14=this.resources();

            this.state._fsp--;

            this.adaptor.addChild(root_0, resources14.getTree());



            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    resources_return: (function() {
        ABEParser.resources_return = function(){};
        org.antlr.lang.extend(ABEParser.resources_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:27:1: resources : ( ( resource )+ | ALL ) ;
    // $ANTLR start "resources"
    resources: function() {
        var retval = new ABEParser.resources_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var ALL16 = null;
         var resource15 = null;

        var ALL16_tree=null;

        try {
            // ABE.g:27:11: ( ( ( resource )+ | ALL ) )
            // ABE.g:27:13: ( ( resource )+ | ALL )
            root_0 = this.adaptor.nil();

            // ABE.g:27:13: ( ( resource )+ | ALL )
            var alt8=2;
            var LA8_0 = this.input.LA(1);

            if ( ((LA8_0>=REGEXP && LA8_0<=LOCATION)) ) {
                alt8=1;
            }
            else if ( (LA8_0==ALL) ) {
                alt8=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 8, 0, this.input);

                throw nvae;
            }
            switch (alt8) {
                case 1 :
                    // ABE.g:27:14: ( resource )+
                    // ABE.g:27:14: ( resource )+
                    var cnt7=0;
                    loop7:
                    do {
                        var alt7=2;
                        var LA7_0 = this.input.LA(1);

                        if ( ((LA7_0>=REGEXP && LA7_0<=LOCATION)) ) {
                            alt7=1;
                        }


                        switch (alt7) {
                        case 1 :
                            // ABE.g:27:14: resource
                            this.pushFollow(ABEParser.FOLLOW_resource_in_resources173);
                            resource15=this.resource();

                            this.state._fsp--;

                            this.adaptor.addChild(root_0, resource15.getTree());


                            break;

                        default :
                            if ( cnt7 >= 1 ) {
                                break loop7;
                            }
                                var eee = new org.antlr.runtime.EarlyExitException(7, this.input);
                                throw eee;
                        }
                        cnt7++;
                    } while (true);



                    break;
                case 2 :
                    // ABE.g:27:26: ALL
                    ALL16=this.match(this.input,ALL,ABEParser.FOLLOW_ALL_in_resources178); 
                    ALL16_tree = this.adaptor.create(ALL16);
                    this.adaptor.addChild(root_0, ALL16_tree);



                    break;

            }




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    resource_return: (function() {
        ABEParser.resource_return = function(){};
        org.antlr.lang.extend(ABEParser.resource_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:29:1: resource : ( REGEXP | GLOB | URI | LOCATION );
    // $ANTLR start "resource"
    resource: function() {
        var retval = new ABEParser.resource_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var set17 = null;

        var set17_tree=null;

        try {
            // ABE.g:29:11: ( REGEXP | GLOB | URI | LOCATION )
            // ABE.g:
            root_0 = this.adaptor.nil();

            set17=this.input.LT(1);
            if ( (this.input.LA(1)>=REGEXP && this.input.LA(1)<=LOCATION) ) {
                this.input.consume();
                this.adaptor.addChild(root_0, this.adaptor.create(set17));
                this.state.errorRecovery=false;
            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                throw mse;
            }




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    },

    // inline static return class
    action_return: (function() {
        ABEParser.action_return = function(){};
        org.antlr.lang.extend(ABEParser.action_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:31:1: action : ( A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT );
    // $ANTLR start "action"
    action: function() {
        var retval = new ABEParser.action_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var set18 = null;

        var set18_tree=null;

        try {
            // ABE.g:31:11: ( A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT )
            // ABE.g:
            root_0 = this.adaptor.nil();

            set18=this.input.LT(1);
            if ( (this.input.LA(1)>=A_DENY && this.input.LA(1)<=A_ACCEPT) ) {
                this.input.consume();
                this.adaptor.addChild(root_0, this.adaptor.create(set18));
                this.state.errorRecovery=false;
            }
            else {
                var mse = new org.antlr.runtime.MismatchedSetException(null,this.input);
                throw mse;
            }




            retval.stop = this.input.LT(-1);

            retval.tree = this.adaptor.rulePostProcessing(root_0);
            this.adaptor.setTokenBoundaries(retval.tree, retval.start, retval.stop);

        }
        catch (re) {
            if (re instanceof org.antlr.runtime.RecognitionException) {
                this.reportError(re);
                this.recover(this.input,re);
                retval.tree = this.adaptor.errorNode(this.input, retval.start, this.input.LT(-1), re);
            } else {
                throw re;
            }
        }
        finally {
        }
        return retval;
    }

    // Delegated rules




}, true); // important to pass true to overwrite default implementations

 

// public class variables
org.antlr.lang.augmentObject(ABEParser, {
    tokenNames: ["<invalid>", "<EOR>", "<DOWN>", "<UP>", "T_ACTION", "T_METHODS", "ALL", "HTTPVERB", "SUB", "T_FROM", "T_SITE", "REGEXP", "GLOB", "URI", "LOCATION", "A_DENY", "A_LOGOUT", "A_SANDBOX", "A_ACCEPT", "URI_START", "URI_PART", "LIST_SEP", "WS", "COMMENT"],
    FOLLOW_rule_in_ruleset49: new org.antlr.runtime.BitSet([0x00000400, 0x00000000]),
    FOLLOW_EOF_in_ruleset52: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_subject_in_rule65: new org.antlr.runtime.BitSet([0x00078000, 0x00000000]),
    FOLLOW_predicate_in_rule67: new org.antlr.runtime.BitSet([0x00078002, 0x00000000]),
    FOLLOW_action_in_predicate84: new org.antlr.runtime.BitSet([0x000003C2, 0x00000000]),
    FOLLOW_methods_in_predicate86: new org.antlr.runtime.BitSet([0x00000202, 0x00000000]),
    FOLLOW_origin_in_predicate89: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_method_in_methods115: new org.antlr.runtime.BitSet([0x00000182, 0x00000000]),
    FOLLOW_ALL_in_methods120: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_set_in_method132: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_T_FROM_in_origin149: new org.antlr.runtime.BitSet([0x00007840, 0x00000000]),
    FOLLOW_resources_in_origin151: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_T_SITE_in_subject162: new org.antlr.runtime.BitSet([0x00007840, 0x00000000]),
    FOLLOW_resources_in_subject164: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_resource_in_resources173: new org.antlr.runtime.BitSet([0x00007802, 0x00000000]),
    FOLLOW_ALL_in_resources178: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_set_in_resource0: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_set_in_action0: new org.antlr.runtime.BitSet([0x00000002, 0x00000000])
});

})();