// $ANTLR 3.1.1 ABE.g 2011-03-21 12:45:42

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
    INC_TYPE: 11,
    T_FROM: 14,
    GLOB: 17,
    T__29: 29,
    HTTPVERB: 7,
    T__28: 28,
    A_LOGOUT: 21,
    A_DENY: 20,
    T_ACTION: 4,
    SUB: 8,
    T_METHODS: 5,
    EOF: -1,
    URI: 18,
    T__30: 30,
    INC: 9,
    WS: 26,
    LPAR: 10,
    URI_PART: 25,
    COMMA: 12,
    A_SANDBOX: 22,
    URI_START: 24,
    A_ACCEPT: 23,
    ALL: 6,
    REGEXP: 16,
    LOCATION: 19,
    RPAR: 13,
    T_SITE: 15,
    COMMENT: 27
});

(function(){
// public class variables
var INC_TYPE= 11,
    T_FROM= 14,
    GLOB= 17,
    T__29= 29,
    HTTPVERB= 7,
    T__28= 28,
    A_LOGOUT= 21,
    A_DENY= 20,
    T_ACTION= 4,
    SUB= 8,
    T_METHODS= 5,
    EOF= -1,
    URI= 18,
    T__30= 30,
    INC= 9,
    WS= 26,
    LPAR= 10,
    URI_PART= 25,
    COMMA= 12,
    A_SANDBOX= 22,
    URI_START= 24,
    A_ACCEPT= 23,
    ALL= 6,
    REGEXP= 16,
    LOCATION= 19,
    RPAR= 13,
    T_SITE= 15,
    COMMENT= 27;

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

    // ABE.g:14:1: rule : subject ( predicate )+ -> subject ( predicate )+ ;
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
            // ABE.g:14:11: ( subject ( predicate )+ -> subject ( predicate )+ )
            // ABE.g:14:13: subject ( predicate )+
            this.pushFollow(ABEParser.FOLLOW_subject_in_rule65);
            subject3=this.subject();

            this.state._fsp--;

            stream_subject.add(subject3.getTree());
            // ABE.g:14:21: ( predicate )+
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
                    // ABE.g:14:21: predicate
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
            // 14:32: -> subject ( predicate )+
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

    // ABE.g:15:1: predicate : action ( methods )? ( origin )? -> T_ACTION action T_METHODS ( methods )? ( origin )? ;
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
            // ABE.g:15:11: ( action ( methods )? ( origin )? -> T_ACTION action T_METHODS ( methods )? ( origin )? )
            // ABE.g:15:13: action ( methods )? ( origin )?
            this.pushFollow(ABEParser.FOLLOW_action_in_predicate83);
            action5=this.action();

            this.state._fsp--;

            stream_action.add(action5.getTree());
            // ABE.g:15:20: ( methods )?
            var alt3=2;
            var LA3_0 = this.input.LA(1);

            if ( ((LA3_0>=ALL && LA3_0<=INC)) ) {
                alt3=1;
            }
            switch (alt3) {
                case 1 :
                    // ABE.g:15:20: methods
                    this.pushFollow(ABEParser.FOLLOW_methods_in_predicate85);
                    methods6=this.methods();

                    this.state._fsp--;

                    stream_methods.add(methods6.getTree());


                    break;

            }

            // ABE.g:15:29: ( origin )?
            var alt4=2;
            var LA4_0 = this.input.LA(1);

            if ( (LA4_0==T_FROM) ) {
                alt4=1;
            }
            switch (alt4) {
                case 1 :
                    // ABE.g:15:29: origin
                    this.pushFollow(ABEParser.FOLLOW_origin_in_predicate88);
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
            // 15:37: -> T_ACTION action T_METHODS ( methods )? ( origin )?
            {
                this.adaptor.addChild(root_0, this.adaptor.create(T_ACTION, "T_ACTION"));
                this.adaptor.addChild(root_0, stream_action.nextTree());
                this.adaptor.addChild(root_0, this.adaptor.create(T_METHODS, "T_METHODS"));
                // ABE.g:15:66: ( methods )?
                if ( stream_methods.hasNext() ) {
                    this.adaptor.addChild(root_0, stream_methods.nextTree());

                }
                stream_methods.reset();
                // ABE.g:15:75: ( origin )?
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

    // ABE.g:16:1: methods : ( ( method )+ | ALL ) ;
    // $ANTLR start "methods"
    methods: function() {
        var retval = new ABEParser.methods_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var ALL9 = null;
         var method8 = null;

        var ALL9_tree=null;

        try {
            // ABE.g:16:11: ( ( ( method )+ | ALL ) )
            // ABE.g:16:13: ( ( method )+ | ALL )
            root_0 = this.adaptor.nil();

            // ABE.g:16:13: ( ( method )+ | ALL )
            var alt6=2;
            var LA6_0 = this.input.LA(1);

            if ( ((LA6_0>=HTTPVERB && LA6_0<=INC)) ) {
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
                    // ABE.g:16:14: ( method )+
                    // ABE.g:16:14: ( method )+
                    var cnt5=0;
                    loop5:
                    do {
                        var alt5=2;
                        var LA5_0 = this.input.LA(1);

                        if ( ((LA5_0>=HTTPVERB && LA5_0<=INC)) ) {
                            alt5=1;
                        }


                        switch (alt5) {
                        case 1 :
                            // ABE.g:16:14: method
                            this.pushFollow(ABEParser.FOLLOW_method_in_methods114);
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
                    // ABE.g:16:24: ALL
                    ALL9=this.match(this.input,ALL,ABEParser.FOLLOW_ALL_in_methods119); 
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

    // ABE.g:17:1: method : ( HTTPVERB | SUB | inclusion ) ;
    // $ANTLR start "method"
    method: function() {
        var retval = new ABEParser.method_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var HTTPVERB10 = null;
        var SUB11 = null;
         var inclusion12 = null;

        var HTTPVERB10_tree=null;
        var SUB11_tree=null;

        try {
            // ABE.g:17:11: ( ( HTTPVERB | SUB | inclusion ) )
            // ABE.g:17:13: ( HTTPVERB | SUB | inclusion )
            root_0 = this.adaptor.nil();

            // ABE.g:17:13: ( HTTPVERB | SUB | inclusion )
            var alt7=3;
            switch ( this.input.LA(1) ) {
            case HTTPVERB:
                alt7=1;
                break;
            case SUB:
                alt7=2;
                break;
            case INC:
                alt7=3;
                break;
            default:
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 7, 0, this.input);

                throw nvae;
            }

            switch (alt7) {
                case 1 :
                    // ABE.g:17:14: HTTPVERB
                    HTTPVERB10=this.match(this.input,HTTPVERB,ABEParser.FOLLOW_HTTPVERB_in_method132); 
                    HTTPVERB10_tree = this.adaptor.create(HTTPVERB10);
                    this.adaptor.addChild(root_0, HTTPVERB10_tree);



                    break;
                case 2 :
                    // ABE.g:17:25: SUB
                    SUB11=this.match(this.input,SUB,ABEParser.FOLLOW_SUB_in_method136); 
                    SUB11_tree = this.adaptor.create(SUB11);
                    this.adaptor.addChild(root_0, SUB11_tree);



                    break;
                case 3 :
                    // ABE.g:17:31: inclusion
                    this.pushFollow(ABEParser.FOLLOW_inclusion_in_method140);
                    inclusion12=this.inclusion();

                    this.state._fsp--;

                    this.adaptor.addChild(root_0, inclusion12.getTree());


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
    inclusion_return: (function() {
        ABEParser.inclusion_return = function(){};
        org.antlr.lang.extend(ABEParser.inclusion_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:18:1: inclusion : INC ( LPAR ( INC_TYPE COMMA )* ( INC_TYPE )? RPAR )? ;
    // $ANTLR start "inclusion"
    inclusion: function() {
        var retval = new ABEParser.inclusion_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var INC13 = null;
        var LPAR14 = null;
        var INC_TYPE15 = null;
        var COMMA16 = null;
        var INC_TYPE17 = null;
        var RPAR18 = null;

        var INC13_tree=null;
        var LPAR14_tree=null;
        var INC_TYPE15_tree=null;
        var COMMA16_tree=null;
        var INC_TYPE17_tree=null;
        var RPAR18_tree=null;

        try {
            // ABE.g:18:11: ( INC ( LPAR ( INC_TYPE COMMA )* ( INC_TYPE )? RPAR )? )
            // ABE.g:18:13: INC ( LPAR ( INC_TYPE COMMA )* ( INC_TYPE )? RPAR )?
            root_0 = this.adaptor.nil();

            INC13=this.match(this.input,INC,ABEParser.FOLLOW_INC_in_inclusion149); 
            INC13_tree = this.adaptor.create(INC13);
            this.adaptor.addChild(root_0, INC13_tree);

            // ABE.g:18:17: ( LPAR ( INC_TYPE COMMA )* ( INC_TYPE )? RPAR )?
            var alt10=2;
            var LA10_0 = this.input.LA(1);

            if ( (LA10_0==LPAR) ) {
                alt10=1;
            }
            switch (alt10) {
                case 1 :
                    // ABE.g:18:18: LPAR ( INC_TYPE COMMA )* ( INC_TYPE )? RPAR
                    LPAR14=this.match(this.input,LPAR,ABEParser.FOLLOW_LPAR_in_inclusion152); 
                    LPAR14_tree = this.adaptor.create(LPAR14);
                    this.adaptor.addChild(root_0, LPAR14_tree);

                    // ABE.g:18:23: ( INC_TYPE COMMA )*
                    loop8:
                    do {
                        var alt8=2;
                        var LA8_0 = this.input.LA(1);

                        if ( (LA8_0==INC_TYPE) ) {
                            var LA8_1 = this.input.LA(2);

                            if ( (LA8_1==COMMA) ) {
                                alt8=1;
                            }


                        }


                        switch (alt8) {
                        case 1 :
                            // ABE.g:18:24: INC_TYPE COMMA
                            INC_TYPE15=this.match(this.input,INC_TYPE,ABEParser.FOLLOW_INC_TYPE_in_inclusion155); 
                            INC_TYPE15_tree = this.adaptor.create(INC_TYPE15);
                            this.adaptor.addChild(root_0, INC_TYPE15_tree);

                            COMMA16=this.match(this.input,COMMA,ABEParser.FOLLOW_COMMA_in_inclusion157); 
                            COMMA16_tree = this.adaptor.create(COMMA16);
                            this.adaptor.addChild(root_0, COMMA16_tree);



                            break;

                        default :
                            break loop8;
                        }
                    } while (true);

                    // ABE.g:18:41: ( INC_TYPE )?
                    var alt9=2;
                    var LA9_0 = this.input.LA(1);

                    if ( (LA9_0==INC_TYPE) ) {
                        alt9=1;
                    }
                    switch (alt9) {
                        case 1 :
                            // ABE.g:18:41: INC_TYPE
                            INC_TYPE17=this.match(this.input,INC_TYPE,ABEParser.FOLLOW_INC_TYPE_in_inclusion161); 
                            INC_TYPE17_tree = this.adaptor.create(INC_TYPE17);
                            this.adaptor.addChild(root_0, INC_TYPE17_tree);



                            break;

                    }

                    RPAR18=this.match(this.input,RPAR,ABEParser.FOLLOW_RPAR_in_inclusion164); 
                    RPAR18_tree = this.adaptor.create(RPAR18);
                    this.adaptor.addChild(root_0, RPAR18_tree);



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
    origin_return: (function() {
        ABEParser.origin_return = function(){};
        org.antlr.lang.extend(ABEParser.origin_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:19:1: origin : T_FROM oresources ;
    // $ANTLR start "origin"
    origin: function() {
        var retval = new ABEParser.origin_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var T_FROM19 = null;
         var oresources20 = null;

        var T_FROM19_tree=null;

        try {
            // ABE.g:19:11: ( T_FROM oresources )
            // ABE.g:19:13: T_FROM oresources
            root_0 = this.adaptor.nil();

            T_FROM19=this.match(this.input,T_FROM,ABEParser.FOLLOW_T_FROM_in_origin177); 
            T_FROM19_tree = this.adaptor.create(T_FROM19);
            this.adaptor.addChild(root_0, T_FROM19_tree);

            this.pushFollow(ABEParser.FOLLOW_oresources_in_origin179);
            oresources20=this.oresources();

            this.state._fsp--;

            this.adaptor.addChild(root_0, oresources20.getTree());



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

    // ABE.g:20:1: subject : T_SITE resources ;
    // $ANTLR start "subject"
    subject: function() {
        var retval = new ABEParser.subject_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var T_SITE21 = null;
         var resources22 = null;

        var T_SITE21_tree=null;

        try {
            // ABE.g:20:11: ( T_SITE resources )
            // ABE.g:20:13: T_SITE resources
            root_0 = this.adaptor.nil();

            T_SITE21=this.match(this.input,T_SITE,ABEParser.FOLLOW_T_SITE_in_subject189); 
            T_SITE21_tree = this.adaptor.create(T_SITE21);
            this.adaptor.addChild(root_0, T_SITE21_tree);

            this.pushFollow(ABEParser.FOLLOW_resources_in_subject191);
            resources22=this.resources();

            this.state._fsp--;

            this.adaptor.addChild(root_0, resources22.getTree());



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
    oresources_return: (function() {
        ABEParser.oresources_return = function(){};
        org.antlr.lang.extend(ABEParser.oresources_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:21:1: oresources : ( ( oresource )+ | ALL ) ;
    // $ANTLR start "oresources"
    oresources: function() {
        var retval = new ABEParser.oresources_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var ALL24 = null;
         var oresource23 = null;

        var ALL24_tree=null;

        try {
            // ABE.g:21:11: ( ( ( oresource )+ | ALL ) )
            // ABE.g:21:13: ( ( oresource )+ | ALL )
            root_0 = this.adaptor.nil();

            // ABE.g:21:13: ( ( oresource )+ | ALL )
            var alt12=2;
            var LA12_0 = this.input.LA(1);

            if ( ((LA12_0>=REGEXP && LA12_0<=LOCATION)||(LA12_0>=28 && LA12_0<=30)) ) {
                alt12=1;
            }
            else if ( (LA12_0==ALL) ) {
                alt12=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 12, 0, this.input);

                throw nvae;
            }
            switch (alt12) {
                case 1 :
                    // ABE.g:21:14: ( oresource )+
                    // ABE.g:21:14: ( oresource )+
                    var cnt11=0;
                    loop11:
                    do {
                        var alt11=2;
                        var LA11_0 = this.input.LA(1);

                        if ( ((LA11_0>=REGEXP && LA11_0<=LOCATION)||(LA11_0>=28 && LA11_0<=30)) ) {
                            alt11=1;
                        }


                        switch (alt11) {
                        case 1 :
                            // ABE.g:21:14: oresource
                            this.pushFollow(ABEParser.FOLLOW_oresource_in_oresources199);
                            oresource23=this.oresource();

                            this.state._fsp--;

                            this.adaptor.addChild(root_0, oresource23.getTree());


                            break;

                        default :
                            if ( cnt11 >= 1 ) {
                                break loop11;
                            }
                                var eee = new org.antlr.runtime.EarlyExitException(11, this.input);
                                throw eee;
                        }
                        cnt11++;
                    } while (true);



                    break;
                case 2 :
                    // ABE.g:21:27: ALL
                    ALL24=this.match(this.input,ALL,ABEParser.FOLLOW_ALL_in_oresources204); 
                    ALL24_tree = this.adaptor.create(ALL24);
                    this.adaptor.addChild(root_0, ALL24_tree);



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
    resources_return: (function() {
        ABEParser.resources_return = function(){};
        org.antlr.lang.extend(ABEParser.resources_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:22:1: resources : ( ( resource )+ | ALL ) ;
    // $ANTLR start "resources"
    resources: function() {
        var retval = new ABEParser.resources_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var ALL26 = null;
         var resource25 = null;

        var ALL26_tree=null;

        try {
            // ABE.g:22:11: ( ( ( resource )+ | ALL ) )
            // ABE.g:22:13: ( ( resource )+ | ALL )
            root_0 = this.adaptor.nil();

            // ABE.g:22:13: ( ( resource )+ | ALL )
            var alt14=2;
            var LA14_0 = this.input.LA(1);

            if ( ((LA14_0>=REGEXP && LA14_0<=LOCATION)) ) {
                alt14=1;
            }
            else if ( (LA14_0==ALL) ) {
                alt14=2;
            }
            else {
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 14, 0, this.input);

                throw nvae;
            }
            switch (alt14) {
                case 1 :
                    // ABE.g:22:14: ( resource )+
                    // ABE.g:22:14: ( resource )+
                    var cnt13=0;
                    loop13:
                    do {
                        var alt13=2;
                        var LA13_0 = this.input.LA(1);

                        if ( ((LA13_0>=REGEXP && LA13_0<=LOCATION)) ) {
                            alt13=1;
                        }


                        switch (alt13) {
                        case 1 :
                            // ABE.g:22:14: resource
                            this.pushFollow(ABEParser.FOLLOW_resource_in_resources214);
                            resource25=this.resource();

                            this.state._fsp--;

                            this.adaptor.addChild(root_0, resource25.getTree());


                            break;

                        default :
                            if ( cnt13 >= 1 ) {
                                break loop13;
                            }
                                var eee = new org.antlr.runtime.EarlyExitException(13, this.input);
                                throw eee;
                        }
                        cnt13++;
                    } while (true);



                    break;
                case 2 :
                    // ABE.g:22:26: ALL
                    ALL26=this.match(this.input,ALL,ABEParser.FOLLOW_ALL_in_resources219); 
                    ALL26_tree = this.adaptor.create(ALL26);
                    this.adaptor.addChild(root_0, ALL26_tree);



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
    oresource_return: (function() {
        ABEParser.oresource_return = function(){};
        org.antlr.lang.extend(ABEParser.oresource_return,
                          org.antlr.runtime.ParserRuleReturnScope,
        {
            getTree: function() { return this.tree; }
        });
        return;
    })(),

    // ABE.g:23:1: oresource : ( resource | 'SELF' | 'SELF+' | 'SELF++' );
    // $ANTLR start "oresource"
    oresource: function() {
        var retval = new ABEParser.oresource_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var string_literal28 = null;
        var string_literal29 = null;
        var string_literal30 = null;
         var resource27 = null;

        var string_literal28_tree=null;
        var string_literal29_tree=null;
        var string_literal30_tree=null;

        try {
            // ABE.g:23:10: ( resource | 'SELF' | 'SELF+' | 'SELF++' )
            var alt15=4;
            switch ( this.input.LA(1) ) {
            case REGEXP:
            case GLOB:
            case URI:
            case LOCATION:
                alt15=1;
                break;
            case 28:
                alt15=2;
                break;
            case 29:
                alt15=3;
                break;
            case 30:
                alt15=4;
                break;
            default:
                var nvae =
                    new org.antlr.runtime.NoViableAltException("", 15, 0, this.input);

                throw nvae;
            }

            switch (alt15) {
                case 1 :
                    // ABE.g:23:12: resource
                    root_0 = this.adaptor.nil();

                    this.pushFollow(ABEParser.FOLLOW_resource_in_oresource227);
                    resource27=this.resource();

                    this.state._fsp--;

                    this.adaptor.addChild(root_0, resource27.getTree());


                    break;
                case 2 :
                    // ABE.g:23:23: 'SELF'
                    root_0 = this.adaptor.nil();

                    string_literal28=this.match(this.input,28,ABEParser.FOLLOW_28_in_oresource231); 
                    string_literal28_tree = this.adaptor.create(string_literal28);
                    this.adaptor.addChild(root_0, string_literal28_tree);



                    break;
                case 3 :
                    // ABE.g:23:32: 'SELF+'
                    root_0 = this.adaptor.nil();

                    string_literal29=this.match(this.input,29,ABEParser.FOLLOW_29_in_oresource235); 
                    string_literal29_tree = this.adaptor.create(string_literal29);
                    this.adaptor.addChild(root_0, string_literal29_tree);



                    break;
                case 4 :
                    // ABE.g:23:42: 'SELF++'
                    root_0 = this.adaptor.nil();

                    string_literal30=this.match(this.input,30,ABEParser.FOLLOW_30_in_oresource239); 
                    string_literal30_tree = this.adaptor.create(string_literal30);
                    this.adaptor.addChild(root_0, string_literal30_tree);



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

    // ABE.g:24:1: resource : ( REGEXP | GLOB | URI | LOCATION );
    // $ANTLR start "resource"
    resource: function() {
        var retval = new ABEParser.resource_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var set31 = null;

        var set31_tree=null;

        try {
            // ABE.g:24:11: ( REGEXP | GLOB | URI | LOCATION )
            // ABE.g:
            root_0 = this.adaptor.nil();

            set31=this.input.LT(1);
            if ( (this.input.LA(1)>=REGEXP && this.input.LA(1)<=LOCATION) ) {
                this.input.consume();
                this.adaptor.addChild(root_0, this.adaptor.create(set31));
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

    // ABE.g:25:1: action : ( A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT );
    // $ANTLR start "action"
    action: function() {
        var retval = new ABEParser.action_return();
        retval.start = this.input.LT(1);

        var root_0 = null;

        var set32 = null;

        var set32_tree=null;

        try {
            // ABE.g:25:11: ( A_DENY | A_LOGOUT | A_SANDBOX | A_ACCEPT )
            // ABE.g:
            root_0 = this.adaptor.nil();

            set32=this.input.LT(1);
            if ( (this.input.LA(1)>=A_DENY && this.input.LA(1)<=A_ACCEPT) ) {
                this.input.consume();
                this.adaptor.addChild(root_0, this.adaptor.create(set32));
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
    tokenNames: ["<invalid>", "<EOR>", "<DOWN>", "<UP>", "T_ACTION", "T_METHODS", "ALL", "HTTPVERB", "SUB", "INC", "LPAR", "INC_TYPE", "COMMA", "RPAR", "T_FROM", "T_SITE", "REGEXP", "GLOB", "URI", "LOCATION", "A_DENY", "A_LOGOUT", "A_SANDBOX", "A_ACCEPT", "URI_START", "URI_PART", "WS", "COMMENT", "'SELF'", "'SELF+'", "'SELF++'"],
    FOLLOW_rule_in_ruleset49: new org.antlr.runtime.BitSet([0x00008000, 0x00000000]),
    FOLLOW_EOF_in_ruleset52: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_subject_in_rule65: new org.antlr.runtime.BitSet([0x00F00000, 0x00000000]),
    FOLLOW_predicate_in_rule67: new org.antlr.runtime.BitSet([0x00F00002, 0x00000000]),
    FOLLOW_action_in_predicate83: new org.antlr.runtime.BitSet([0x000043C2, 0x00000000]),
    FOLLOW_methods_in_predicate85: new org.antlr.runtime.BitSet([0x00004002, 0x00000000]),
    FOLLOW_origin_in_predicate88: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_method_in_methods114: new org.antlr.runtime.BitSet([0x00000382, 0x00000000]),
    FOLLOW_ALL_in_methods119: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_HTTPVERB_in_method132: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_SUB_in_method136: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_inclusion_in_method140: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_INC_in_inclusion149: new org.antlr.runtime.BitSet([0x00000402, 0x00000000]),
    FOLLOW_LPAR_in_inclusion152: new org.antlr.runtime.BitSet([0x00002800, 0x00000000]),
    FOLLOW_INC_TYPE_in_inclusion155: new org.antlr.runtime.BitSet([0x00001000, 0x00000000]),
    FOLLOW_COMMA_in_inclusion157: new org.antlr.runtime.BitSet([0x00002800, 0x00000000]),
    FOLLOW_INC_TYPE_in_inclusion161: new org.antlr.runtime.BitSet([0x00002000, 0x00000000]),
    FOLLOW_RPAR_in_inclusion164: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_T_FROM_in_origin177: new org.antlr.runtime.BitSet([0x700F0040, 0x00000000]),
    FOLLOW_oresources_in_origin179: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_T_SITE_in_subject189: new org.antlr.runtime.BitSet([0x000F0040, 0x00000000]),
    FOLLOW_resources_in_subject191: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_oresource_in_oresources199: new org.antlr.runtime.BitSet([0x700F0002, 0x00000000]),
    FOLLOW_ALL_in_oresources204: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_resource_in_resources214: new org.antlr.runtime.BitSet([0x000F0002, 0x00000000]),
    FOLLOW_ALL_in_resources219: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_resource_in_oresource227: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_28_in_oresource231: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_29_in_oresource235: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_30_in_oresource239: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_set_in_resource0: new org.antlr.runtime.BitSet([0x00000002, 0x00000000]),
    FOLLOW_set_in_action0: new org.antlr.runtime.BitSet([0x00000002, 0x00000000])
});

})();