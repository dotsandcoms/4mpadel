                                                {/* Ambient Glows */}
                                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-padel-green/10 blur-[120px] rounded-full pointer-events-none" />
                                                <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/10 blur-[80px] rounded-full pointer-events-none" />

                                                <div className="relative mb-10">
                                                    <div className="w-28 h-28 bg-padel-green/20 rounded-full flex items-center justify-center mx-auto relative z-10 animate-in zoom-in duration-500 delay-150 shadow-2xl shadow-padel-green/40">
                                                        <CheckCircle className="w-14 h-14 text-padel-green" />
                                                    </div>
                                                    <div className="absolute inset-0 bg-padel-green/30 blur-2xl rounded-full scale-110 animate-pulse" />
                                                </div>

                                                <h3 className="text-4xl font-black text-white mb-4 tracking-tight uppercase leading-none italic animate-in fade-in slide-in-from-bottom duration-700">
                                                    Registration <br />
                                                    <span className="text-padel-green">Confirmed</span>
                                                </h3>

                                                <p className="text-gray-400 text-sm mb-12 max-w-xs mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom duration-1000">
                                                    You've been successfully registered for <span className="text-white font-bold">{event.event_name}</span>.
                                                    Your payment was confirmed and your profile is updated.
                                                </p>

                                                <div className="flex flex-col gap-4 w-full max-w-xs animate-in fade-in slide-in-from-bottom duration-1000 delay-300">
                                                    <button
                                                        onClick={() => {
                                                            setIsModalOpen(false);
                                                            window.location.reload();
                                                        }}
                                                        className="w-full h-16 bg-padel-green hover:bg-white text-black font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 rounded-2xl transition-all duration-300 shadow-2xl shadow-padel-green/30 hover:scale-[1.03] active:scale-95"
                                                    >
                                                        <span>Close & Refresh</span>
                                                        <ArrowRight className="w-4 h-4" />
                                                    </button>
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Data Syncing Complete</p>
                                             </>
